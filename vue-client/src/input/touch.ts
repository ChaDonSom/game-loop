/**
 * Touch input state and math. No DOM: `TouchControls.vue` feeds pointer data in, `soapbox-init` reads a `Pad` out.
 *
 * Angles are radians. Screen y points down, so a growing `atan2(dy, dx)` is clockwise on screen. Clockwise wheel =
 * positive `wheelAngle` = positive `steer` = steer right (the drive code flips the sign for Rapier).
 */
import { ref, watch } from "vue"
import type RAPIER from "@dimforge/rapier3d-compat"
import { MAX_STEERING, type FrontAxleSlip, type Pad } from "@game-loop/shared"
import { storedChoice, storedNumber } from "./storedChoice.ts"

const DEG = Math.PI / 180

// ----------------------------------------------------
// #region MARK: Slots (tune on a phone)
// ----------------------------------------------------

/** Wheel degrees per finger degree. At 1 (1:1), the wheel follows the finger; lock needs a 450° finger arc (1.25 turns). */
export const WHEEL_GAIN = 1
/** Default total wheel turn, lock to lock. The "lock" input in the status bar changes it at runtime. */
export const VISUAL_LOCK = 900 * DEG
/** Self-centering, in wheel degrees per metre the front wheels roll. Holds at low speed; see `CENTER_SAT_SPEED`. */
export const CENTER_RATE = 120 * DEG
/**
 * Speed (m/s) where centering levels off. Effective speed = v / (1 + v / CENTER_SAT_SPEED): about `v` well below it,
 * and it never passes CENTER_SAT_SPEED, so centering never gets faster than CENTER_RATE × CENTER_SAT_SPEED (960°/s at 8).
 * Real steering does the same: damping and inertia cap the return rate. Raise it to center faster at speed.
 */
export const CENTER_SAT_SPEED = 8
/** Wheel radius as a fraction of the viewport short side. */
export const WHEEL_RADIUS_FRAC = 0.16
/** Wheel radius on phones (coarse pointer, short side under 500 px). 0.21 = diameter equal to the pedal height. */
export const PHONE_WHEEL_RADIUS_FRAC = 0.21
/** Gap from the screen edge (plus safe area), CSS px. */
export const EDGE_MARGIN = 24
/** Finger inside this fraction of the radius does not turn the wheel (atan2 jitters near the center). */
export const DEAD_RADIUS_FRAC = 0.25
export const PEDAL_W_FRAC = 0.14
export const PEDAL_H_FRAC = 0.42
export const PEDAL_DEAD_LOW = 0.08
export const PEDAL_SAT_HIGH = 0.92
/**
 * Pedal output = travel ^ PEDAL_CURVE_EXP. 1 = linear. 2 = half travel gives 25%, so the low range gets more finger room.
 * Full gas is about 11 m/s² on this 2.3 kg car; a typical road car pulls about 3–4 m/s², which is 30% gas. At 2, that
 * is a finger at about half height.
 */
export const PEDAL_CURVE_EXP = 2

// Slide-aware centering (plan C). Speeds in m/s, as the physics uses them; mph in the comments.

/** Forward speed (m/s) below which the centering target is straight. 1 m/s ≈ 2 mph. */
export const TARGET_BLEND_LOW = 1
/** Forward speed (m/s) above which the target is the full 0-front-slip angle. 4 m/s ≈ 9 mph. */
export const TARGET_BLEND_HIGH = 4
// YOUR CHOICE: fraction of the 0-front-slip angle the wheel goes to, 0…1. 1 = what reality does (plan C1).
// Try 1 first, then lower it, and compare how a slide ends.
export const ALIGN_GAIN = 1

// YOUR CHOICE: length of the haptic tap, ms. Slide, let go, catch: does the tap come when you would grab?
export const TAP_MS = 15
// YOUR CHOICE: rear slip angle (radians) that counts as "sliding" for the tap. The rear wheels do not steer, so their
// slip stays small in a normal corner and grows in a slide. 0.15 rad ≈ 9°. Check that a normal corner stays quiet.
export const SLIDE_REAR_SLIP = 0.15
/** After a tap, the gap must grow past this (wheel radians) before the next tap. 30° of wheel. */
export const TAP_REARM_GAP = 30 * DEG

// Flick with momentum (`notes/research/fast-wheel-input.md`, option 1).

// YOUR CHOICE: how fast a flicked wheel slows down, per second (exponential). 3 = it loses 95% of its spin in 1 s.
// Lower = it coasts further. Flick toward lock and let go: does it stop where you expect?
export const FLICK_FRICTION = 3
// YOUR CHOICE: release spin (wheel rad/s) below which there is no flick. 2 rad/s ≈ 115°/s. Slow releases stay put.
export const FLICK_MIN_SPIN = 2
/** Spin below this (rad/s) stops. */
const FLICK_STOP_SPIN = 0.2
/** Time constant (s) of the held wheel's spin estimate. Short = follows the last instant of the drag. */
const SPIN_SMOOTHING_S = 0.05

/** SLOT. Response curve from normalized wheel angle (−1…1) to steer (−1…1). */
function applyCurve(x: number) {
  return x
}

/** Pedal travel (0…1, what the fill shows) to pedal output (0…1, what the car gets). */
function pedalCurve(travel: number) {
  return Math.pow(travel, PEDAL_CURVE_EXP)
}

// YOUR CHOICE: one centering step, toward `target` (wheel radians). Never crosses the target; returns `angle`
// unchanged when `rolling` is 0. Today's rate rule. Real wheels snap to countersteer fast in a slide: is the
// 960°/s cap fast enough? A faster rate for a large gap would go here.
function centerStep(angle: number, target: number, rolling: number, dt: number) {
  const effective = rolling / (1 + rolling / CENTER_SAT_SPEED)
  const gap = target - angle
  return angle + Math.sign(gap) * Math.min(Math.abs(gap), CENTER_RATE * effective * dt)
}

// YOUR CHOICE: how the target goes from straight (stopped, reverse) to the 0-front-slip angle (moving), 0…1.
// Reverse at walking speed (about 3 mph) and release. Then slide at speed and release.
function targetBlend(forwardSpeed: number) {
  return clampUnit((forwardSpeed - TARGET_BLEND_LOW) / (TARGET_BLEND_HIGH - TARGET_BLEND_LOW))
}

// ----------------------------------------------------
// #region MARK: Math helpers
// ----------------------------------------------------

function clampUnit(x: number) {
  return Math.min(1, Math.max(0, x))
}

export function wrapToPi(angle: number) {
  return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI))
}

/** Pedal travel from finger height. `y` and `bottom` are screen px (y down). Clamped 0…1 with dead band. */
export function pedalValue(y: number, bottom: number, height: number) {
  const v = (bottom - y) / height
  if (v <= PEDAL_DEAD_LOW) return 0
  if (v >= PEDAL_SAT_HIGH) return 1
  return (v - PEDAL_DEAD_LOW) / (PEDAL_SAT_HIGH - PEDAL_DEAD_LOW)
}

// ----------------------------------------------------
// #region MARK: Wheel
// ----------------------------------------------------

/** Lock to lock, in wheel degrees. Saved; changed from the status bar. */
export const wheelLockSetting = storedNumber("touchWheelLockDeg", VISUAL_LOCK / DEG, 90, 1440)
let halfLock = (wheelLockSetting.value.value * DEG) / 2
let wheelAngle = 0
let held = false
let lastFingerAngle: number | null = null

/** Grab is relative: the wheel does not jump to the finger. `dx`, `dy` are from the wheel center, screen px. */
export function grabWheel(dx: number, dy: number, radius: number) {
  held = true
  // A grab catches a flicked wheel, even a tap between two physics steps.
  spin = 0
  lastFingerAngle = Math.hypot(dx, dy) < radius * DEAD_RADIUS_FRAC ? null : Math.atan2(dy, dx)
}

export function moveWheel(dx: number, dy: number, radius: number) {
  if (!held) return
  if (Math.hypot(dx, dy) < radius * DEAD_RADIUS_FRAC) {
    lastFingerAngle = null // Re-anchor when the finger leaves the dead zone.
    return
  }
  const fingerAngle = Math.atan2(dy, dx)
  if (lastFingerAngle !== null) {
    const delta = wrapToPi(fingerAngle - lastFingerAngle)
    wheelAngle = Math.max(-halfLock, Math.min(halfLock, wheelAngle + delta * WHEEL_GAIN))
  }
  lastFingerAngle = fingerAngle
}

export function releaseWheel() {
  held = false
  lastFingerAngle = null
}

/** Half the lock-to-lock turn, wheel radians. */
export function getHalfLock() {
  return halfLock
}

// A new lock keeps the steer fraction: the car's steering does not jump, only how far the wheel turns for it.
watch(wheelLockSetting.value, (deg) => {
  const next = (deg * DEG) / 2
  const scale = next / halfLock
  halfLock = next
  wheelAngle *= scale
  wheelTarget *= scale
  spin *= scale
  // The spin estimate compares against the last angle: scale it too, or the rescale reads as a fast spin.
  spinAngle *= scale
})

/** Visual angle (rad) for the SVG. Not curved: the picture shows the wheel, not the curve. */
export function getWheelAngle() {
  return wheelAngle
}

/** Flick with momentum toggle. */
export const wheelFlick = storedChoice("touchWheelFlick", ["off", "on"] as const, "off")

// ----------------------------------------------------
// #region MARK: Centering target and haptic tap (plan C)
// ----------------------------------------------------

let wheelTarget = 0
let sliding = false
let wasHeld = false
let tapArmed = true
let lastGap: number | null = null
let tapSink = (ms: number) => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms)
}

/**
 * Wheel angle (radians) the released wheel turns toward: the front axle's direction of travel, blended to straight
 * at low speed. Assumes `applyCurve` is linear: if you curve it, map through its inverse here.
 */
export function centerTarget(slip: FrontAxleSlip) {
  const road = targetBlend(slip.forwardSpeed) * ALIGN_GAIN * slip.angle
  return Math.max(-1, Math.min(1, road / MAX_STEERING)) * halfLock
}

/** Last target from `updateWheel`, wheel radians. The gap arc and the tap read it. */
export function getWheelTarget() {
  return wheelTarget
}

/** For tests: replace `navigator.vibrate`. */
export function setTapSink(sink: (ms: number) => void) {
  tapSink = sink
}

/** One tap when the held wheel reaches the target (the gap changes sign) while the car slides. */
function updateTap() {
  if (!held) {
    wasHeld = false
    lastGap = null
    return
  }
  if (!wasHeld) {
    wasHeld = true
    tapArmed = true
    lastGap = null
  }
  const gap = wheelTarget - wheelAngle
  if (!tapArmed && Math.abs(gap) > TAP_REARM_GAP) tapArmed = true
  const reached = lastGap !== null && (gap === 0 || Math.sign(gap) !== Math.sign(lastGap))
  if (tapArmed && sliding && reached) {
    tapSink(TAP_MS)
    tapArmed = false
  }
  lastGap = gap
}

/** Wheel spin (rad/s): measured while held, coasting after a flick. */
let spin = 0
let spinAngle = 0
let spinWasHeld = false

/** Track the held wheel's spin; on release with the flick toggle on, keep it, then let friction slow it. */
function updateSpin(dt: number) {
  if (held) {
    const measured = (wheelAngle - spinAngle) / dt
    spin += (measured - spin) * (1 - Math.exp(-dt / SPIN_SMOOTHING_S))
  } else if (spinWasHeld) {
    // Just released.
    if (wheelFlick.value.value !== "on" || Math.abs(spin) < FLICK_MIN_SPIN) spin = 0
  }
  if (!held && spin !== 0) {
    wheelAngle += spin * dt
    spin *= Math.exp(-FLICK_FRICTION * dt)
    if (Math.abs(wheelAngle) >= halfLock) {
      wheelAngle = Math.sign(wheelAngle) * halfLock
      spin = 0
    }
    if (Math.abs(spin) < FLICK_STOP_SPIN) spin = 0
  }
  spinWasHeld = held
  spinAngle = wheelAngle
}

/** Run each fixed step. Centers only while released. */
export function updateWheel(dt: number, rolling: number, slip: FrontAxleSlip) {
  wheelTarget = centerTarget(slip)
  sliding = Math.abs(slip.rearAngle) > SLIDE_REAR_SLIP
  updateSpin(dt)
  if (!held) wheelAngle = centerStep(wheelAngle, wheelTarget, rolling, dt)
  updateTap()
  spinAngle = wheelAngle
}


// ----------------------------------------------------
// #region MARK: Front-wheel rolling (centering source)
// ----------------------------------------------------

const frontWheels = [0, 1]
const prevRotations: Array<number | null> = [null, null]

/**
 * Mean rolling speed (m/s, ≥ 0) of the in-contact front wheels, from `wheelRotation` deltas (radians, accumulating).
 * 0 when no front wheel touches the ground. Front wheels roll free, so this follows the road, not the engine.
 */
export function frontRolling(vehicle: RAPIER.DynamicRayCastVehicleController, dt: number, wheelRadius: number) {
  let sum = 0
  let count = 0
  for (const [slot, i] of frontWheels.entries()) {
    const rotation = vehicle.wheelRotation(i)
    const prev = prevRotations[slot]
    prevRotations[slot] = rotation
    if (rotation === null || prev === null || prev === undefined || !vehicle.wheelIsInContact(i)) continue
    sum += (Math.abs(rotation - prev) / dt) * wheelRadius
    count++
  }
  return count > 0 ? sum / count : 0
}

/** Call on respawn, next to `resetDriveState`. */
export function resetWheel() {
  wheelAngle = 0
  wheelTarget = 0
  spin = 0
  spinAngle = 0
  prevRotations.fill(null)
}

// ----------------------------------------------------
// #region MARK: Pedals
// ----------------------------------------------------

const pedals = { throttle: 0, brake: 0 }
export type PedalName = keyof typeof pedals

export function setPedal(name: PedalName, value: number) {
  pedals[name] = Math.max(0, Math.min(1, value))
}

export function getPedal(name: PedalName) {
  return pedals[name]
}

// ----------------------------------------------------
// #region MARK: Gear and visibility (low-rate, reactive for the UI)
// ----------------------------------------------------

export type Gear = "AUTO" | "D" | "R"
const gearSetting = storedChoice<Gear>("touchGear", ["AUTO", "D", "R"], "AUTO")

export const gear = gearSetting.value
export const touchVisible = ref(false)
const setGear = gearSetting.set

/** Auto → manual D. Manual: D ↔ R. */
export function tapGear() {
  setGear(gear.value === "AUTO" ? "D" : gear.value === "D" ? "R" : "D")
}

/** Manual → auto. */
export function longPressGear() {
  setGear("AUTO")
}

export function getTouchPad(): Pad {
  return {
    connected: true,
    steer: applyCurve(wheelAngle / halfLock),
    throttle: pedalCurve(pedals.throttle),
    brake: pedalCurve(pedals.brake),
    reverse: gear.value === "AUTO" ? undefined : gear.value === "R",
  }
}
