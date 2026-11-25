/**
 * Touch input state and math. No DOM: `TouchControls.vue` feeds pointer data in, `soapbox-init` reads a `Pad` out.
 *
 * Angles are radians. Screen y points down, so a growing `atan2(dy, dx)` is clockwise on screen. Clockwise wheel =
 * positive `wheelAngle` = positive `steer` = steer right (the drive code flips the sign for Rapier).
 */
import { ref } from "vue"
import type RAPIER from "@dimforge/rapier3d-compat"
import type { Pad } from "@game-loop/shared"

const DEG = Math.PI / 180

// ----------------------------------------------------
// #region MARK: Slots (tune on a phone)
// ----------------------------------------------------

/** Wheel degrees per finger degree. At 1 (1:1), the wheel follows the finger; lock needs a 450° finger arc (1.25 turns). */
export const WHEEL_GAIN = 1
/** Total wheel turn, lock to lock. */
export const VISUAL_LOCK = 900 * DEG
/** Self-centering, in wheel degrees per metre the front wheels roll. */
export const CENTER_RATE = 120 * DEG
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

/** SLOT. Response curve from normalized wheel angle (−1…1) to steer (−1…1). */
function applyCurve(x: number) {
  return x
}

/** Pedal travel (0…1, what the fill shows) to pedal output (0…1, what the car gets). */
function pedalCurve(travel: number) {
  return Math.pow(travel, PEDAL_CURVE_EXP)
}

/** SLOT. One centering step. Never crosses zero; returns exactly 0 when `rolling` is 0 and the angle is 0. */
function centerStep(angle: number, rolling: number, dt: number) {
  return angle - Math.sign(angle) * Math.min(Math.abs(angle), CENTER_RATE * rolling * dt)
}

// ----------------------------------------------------
// #region MARK: Math helpers
// ----------------------------------------------------

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

const halfLock = VISUAL_LOCK / 2
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

/** Visual angle (rad) for the SVG. Not curved: the picture shows the wheel, not the curve. */
export function getWheelAngle() {
  return wheelAngle
}

/** Run each fixed step. Centers only while released. */
export function updateWheel(dt: number, rolling: number) {
  if (!held) wheelAngle = centerStep(wheelAngle, rolling, dt)
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
const GEAR_KEY = "touchGear"

function loadGear(): Gear {
  try {
    const saved = localStorage.getItem(GEAR_KEY)
    if (saved === "AUTO" || saved === "D" || saved === "R") return saved
  } catch {
    // Storage blocked: use the default.
  }
  return "AUTO"
}

export const gear = ref<Gear>(loadGear())
export const touchVisible = ref(false)

function setGear(next: Gear) {
  gear.value = next
  try {
    localStorage.setItem(GEAR_KEY, next)
  } catch {
    // Storage blocked: keep the mode for this page only.
  }
}

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
