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
/**
 * YOUR CHOICE: fraction of the 0-front-slip angle the wheel goes to, 0…1. 1 = what reality does (plan C1).
 * Try 1 first, then lower it, and compare how a slide ends.
 */
export const ALIGN_GAIN = 1

/** YOUR CHOICE: length of the haptic tap, ms. Slide, let go, catch: does the tap come when you would grab? */
export const TAP_MS = 15
/**
 * YOUR CHOICE: rear slip angle (radians) that counts as "sliding" for the tap. The rear wheels do not steer, so their
 * slip stays small in a normal corner and grows in a slide. 0.15 rad ≈ 9°. Check that a normal corner stays quiet.
 */
export const SLIDE_REAR_SLIP = 0.15
/** After a tap, the gap must grow past this (wheel radians) before the next tap. 30° of wheel. */
export const TAP_REARM_GAP = 30 * DEG

// Flick with momentum (`notes/research/fast-wheel-input.md`, option 1).

/**
 * YOUR CHOICE: how fast a flicked wheel slows down, per second (exponential). 3 = it loses 95% of its spin in 1 s.
 * Lower = it coasts further. Flick toward lock and let go: does it stop where you expect?
 */
export const FLICK_FRICTION = 3
/** YOUR CHOICE: release spin (wheel rad/s) below which there is no flick. 2 rad/s ≈ 115°/s. Slow releases stay put. */
export const FLICK_MIN_SPIN = 2
/** Spin below this (rad/s) stops. */
const FLICK_STOP_SPIN = 0.2
/** Time constant (s) of the held wheel's spin estimate. Short = follows the last instant of the drag. */
const SPIN_SMOOTHING_S = 0.05

// Local circles (`notes/research/fast-wheel-input.md`, option 4).

/**
 * YOUR CHOICE: wheel turn per turn of the thumb's direction of motion. 1 = one small loop of the thumb, anywhere,
 * turns the wheel 360°. Try small fast circles, then a slow wide arc: which gain feels right?
 */
export const CIRCLE_GAIN = 1
/** YOUR CHOICE: px of thumb travel before a new direction is read. Small = responsive but jittery. */
export const CIRCLE_MIN_STEP_PX = 4
/** A turn of direction larger than this in one step is a reversal or a jump, not a circle: ignored. 100°. */
const CIRCLE_MAX_TURN = 100 * DEG

// Tangent drag (plan W, `notes/plans/tangent-wheel-drag.md`).

/**
 * YOUR CHOICE: px of finger travel from a centered wheel to lock, in tangent mode. Sets the gain and (fixed reach)
 * how far the wheel moves in from the corner. Short = quick lock, twitchy at speed. Long = calm, wheel further in.
 */
export const TANGENT_REACH_PX = 120
export type TangentReachMode = "fixed" | "edge"
/**
 * YOUR CHOICE: the default reach mode, before anyone flips the "edge" pill. "fixed" = same px per degree on every
 * grab. "edge" = the screen edge is always lock. Drive ten slaloms in each. In which do you stop looking at the wheel?
 */
export const TANGENT_REACH_DEFAULT: TangentReachMode = "fixed"

/** SLOT. Response curve from normalized wheel angle (−1…1) to steer (−1…1). */
function applyCurve(x: number) {
  return x
}

/** Pedal travel (0…1, what the fill shows) to pedal output (0…1, what the car gets). */
function pedalCurve(travel: number) {
  return Math.pow(travel, PEDAL_CURVE_EXP)
}

/**
 * YOUR CHOICE: one centering step, toward `target` (wheel radians). Never crosses the target; returns `angle`
 * unchanged when `rolling` is 0. Today's rate rule. Real wheels snap to countersteer fast in a slide: is the
 * 960°/s cap fast enough? A faster rate for a large gap would go here.
 */
function centerStep(angle: number, target: number, rolling: number, dt: number) {
  const effective = rolling / (1 + rolling / CENTER_SAT_SPEED)
  const gap = target - angle
  return angle + Math.sign(gap) * Math.min(Math.abs(gap), CENTER_RATE * effective * dt)
}

/**
 * YOUR CHOICE: how the target goes from straight (stopped, reverse) to the 0-front-slip angle (moving), 0…1.
 * Reverse at walking speed (about 3 mph) and release. Then slide at speed and release.
 */
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
  if (tangent) tangent.angle0 *= scale
})

/** Visual angle (rad) for the SVG. Not curved: the picture shows the wheel, not the curve. */
export function getWheelAngle() {
  return wheelAngle
}

// ----------------------------------------------------
// #region MARK: Tangent drag (plan W)
// ----------------------------------------------------

type Vec2 = { x: number; y: number }
export type WheelDragMode = "angular" | "tangent" | "circles"

/** The setting, as the pill shows and saves it. */
export const wheelDragSetting = storedChoice<WheelDragMode>("touchWheelDrag", ["angular", "tangent", "circles"], "angular")
/** The mode in use. Follows the setting, but not while the wheel is held, so a change cannot split a drag. */
export const wheelDragMode = ref<WheelDragMode>(wheelDragSetting.value.value)
watch(wheelDragSetting.value, (next) => {
  if (!held) wheelDragMode.value = next
})

/** Apply a setting change made while held. Call on wheel release. Returns the mode in use. */
export function syncWheelDragMode() {
  if (!held) wheelDragMode.value = wheelDragSetting.value.value
  return wheelDragMode.value
}

/** Reach mode toggle (tangent mode only). Read at each grab. */
export const wheelTangentReach = storedChoice<TangentReachMode>("touchWheelReach", ["fixed", "edge"], TANGENT_REACH_DEFAULT)
/** Flick with momentum toggle (any drag mode). */
export const wheelFlick = storedChoice("touchWheelFlick", ["off", "on"] as const, "off")
/** Track cue toggle (tangent mode only). */
export const wheelTrackCue = storedChoice("touchWheelCue", ["off", "on"] as const, "off")
/** Target mark on the track toggle (tangent mode only, needs the track cue). */
export const wheelTargetMark = storedChoice("touchWheelTarget", ["off", "on"] as const, "off")

type TangentGrab = {
  mode: TangentReachMode
  /** Unit slider direction (screen px, y down). +t is clockwise. */
  t: Vec2
  /** Touch-down point, from the wheel center. The slider's zero. */
  p0: Vec2
  angle0: number
  /** Reach (px) to lock, the same both ways, so both halves turn the wheel at the same rate. */
  reach: number
  /** Signed px along the slider now. */
  s: number
}
let tangent: TangentGrab | null = null

/** Clockwise tangent at the rim point nearest the finger. A grab near the center acts like a grab at the top. */
export function tangentDirection(dx: number, dy: number, radius: number): Vec2 {
  const r = Math.hypot(dx, dy)
  const u = r >= radius * DEAD_RADIUS_FRAC ? { x: dx / r, y: dy / r } : { x: 0, y: -1 }
  return { x: -u.y, y: u.x }
}

/** px from `p` along unit `d` to the edge of `rect`. 0 if `p` is already outside on that side. */
export function rayToRect(p: Vec2, d: Vec2, rect: { left: number; top: number; right: number; bottom: number }) {
  let best = Infinity
  if (d.x > 0) best = Math.min(best, (rect.right - p.x) / d.x)
  if (d.x < 0) best = Math.min(best, (rect.left - p.x) / d.x)
  if (d.y > 0) best = Math.min(best, (rect.bottom - p.y) / d.y)
  if (d.y < 0) best = Math.min(best, (rect.top - p.y) / d.y)
  return Math.max(0, best)
}

/**
 * Reach (px) of the slider, the same along +t and −t. Fixed: `TANGENT_REACH_PX`. Edge: as long as the shorter half
 * can be, so that half ends at the inset screen edge. At least 1 px so the gain stays finite.
 */
export function tangentReach(
  mode: TangentReachMode,
  p0Screen: Vec2,
  t: Vec2,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  if (mode === "fixed") return TANGENT_REACH_PX
  const plus = rayToRect(p0Screen, t, rect)
  const minus = rayToRect(p0Screen, { x: -t.x, y: -t.y }, rect)
  return Math.max(1, Math.min(plus, minus))
}

/** Wheel angle for `s` px along the slider of `grab`. One rate both ways: lock is `reach` px from a centered wheel. */
export function tangentAngle(grab: TangentGrab, s: number) {
  return Math.max(-halfLock, Math.min(halfLock, grab.angle0 + (s * halfLock) / grab.reach))
}

/** Inverse of `tangentAngle`: where `angle` sits on the slider, clamped to the track ends. */
export function tangentTrackPosition(grab: TangentGrab, angle: number) {
  const s = ((angle - grab.angle0) * grab.reach) / halfLock
  return { s: Math.max(-grab.reach, Math.min(grab.reach, s)), clamped: Math.abs(s) > grab.reach }
}

/** Start a tangent drag. `dx`, `dy` from the wheel center, screen px. `reach` from `tangentReach` for `mode`. */
export function grabTangent(dx: number, dy: number, radius: number, reach: number, mode: TangentReachMode) {
  held = true
  lastFingerAngle = null
  tangent = {
    mode,
    t: tangentDirection(dx, dy, radius),
    p0: { x: dx, y: dy },
    angle0: wheelAngle,
    reach,
    s: 0,
  }
}

/** Absolute from the grab: back at the touch-down point gives the grab angle again. No drift. */
export function moveTangent(dx: number, dy: number) {
  if (!held || !tangent) return
  tangent.s = (dx - tangent.p0.x) * tangent.t.x + (dy - tangent.p0.y) * tangent.t.y
  wheelAngle = tangentAngle(tangent, tangent.s)
}

/** The current (or last) tangent drag, for the track cue. `null` before the first tangent grab. */
export function getTangentGrab(): Readonly<TangentGrab> | null {
  return tangent
}

/**
 * Wheel center distance (px) from the left and bottom edges. Tangent mode moves the wheel in until a slider from any
 * grab point reaches `TANGENT_REACH_PX` in every direction: √(hitR² + L²). `hitR`, not `R`: a grab can land up to
 * the hit radius.
 */
export function wheelCenterInset(mode: WheelDragMode, radius: number, hitRadius: number) {
  const base = EDGE_MARGIN + radius
  if (mode !== "tangent") return base
  return Math.max(base, Math.hypot(hitRadius, TANGENT_REACH_PX))
}

// ----------------------------------------------------
// #region MARK: Local circles
// ----------------------------------------------------

let circleLast: Vec2 | null = null
let circleHeading: number | null = null

/** Start a local-circles drag. The point can be anywhere: only the thumb's direction of motion counts. */
export function grabCircle(x: number, y: number) {
  held = true
  lastFingerAngle = null
  circleLast = { x, y }
  circleHeading = null
}

/**
 * Steer by how much the thumb's direction of motion turns. A clockwise loop on screen turns the wheel clockwise
 * (right) by CIRCLE_GAIN × 360°. A straight drag does not steer.
 */
export function moveCircle(x: number, y: number) {
  if (!held || !circleLast) return
  const vx = x - circleLast.x
  const vy = y - circleLast.y
  if (Math.hypot(vx, vy) < CIRCLE_MIN_STEP_PX) return
  const heading = Math.atan2(vy, vx)
  if (circleHeading !== null) {
    const turn = wrapToPi(heading - circleHeading)
    if (Math.abs(turn) <= CIRCLE_MAX_TURN) {
      wheelAngle = Math.max(-halfLock, Math.min(halfLock, wheelAngle + turn * CIRCLE_GAIN))
    }
  }
  circleHeading = heading
  circleLast = { x, y }
}

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

/** Last target from `updateWheel`, wheel radians. The gap arc, the tap, and the tangent target mark read it. */
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

export function isWheelHeld() {
  return held
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
  tangent = null
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
