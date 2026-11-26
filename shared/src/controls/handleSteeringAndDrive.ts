import RAPIER from "@dimforge/rapier3d-compat"
import { Keys, Pad } from "./types.js"
import { chassisAxes, clamp, dot } from "../math.js"

const maxEngineForce = 25
const minEngineForce = -25
/** Road-wheel steering angle at full lock, radians (about 26°). */
export const MAX_STEERING = 0.45
const maxSteering = MAX_STEERING
const minSteering = -MAX_STEERING

/**
 * SLOT. Brake impulse per wheel per step at full brake (Rapier `setWheelBrake` is a max impulse, N·s). The car is
 * about 2.3 kg. In a headless test from 4.5 m/s: 0.1 stops in about 0.6 m with no pitch; 0.3 and up pitch the car
 * onto its nose and it rocks. The spec placeholder was 1.0.
 */
const BRAKE_FORCE = 0.15
/** SLOT. |speed| (m/s) under which auto mode treats the car as stopped, so brake turns into reverse. */
const STOP_SPEED = 0.3
/** SLOT. Seconds of key hold from 0 to full throttle or brake. 4 s matches the old ±0.1-per-step force ramp. */
const KEY_RAMP_UP_S = 4
/** SLOT. Top speed forward, m/s. */
const MAX_FORWARD_SPEED = 42
/** SLOT. Top speed in reverse, m/s. */
const MAX_REVERSE_SPEED = 20
/** Engine force fades to 0 over this many m/s below top speed, so the car settles at it instead of surging. */
const TOP_SPEED_BAND = 2

const wheelCount = 4
const engineWheels = [2, 3]
const steerWheels = [0, 1]

type DriveState = { steering: number; keyThrottle: number; keyBrake: number }
const controllerStates = new WeakMap<RAPIER.DynamicRayCastVehicleController, DriveState>()

/** SLOT. Key pedal build-up while held. Depends on step count only, so client and server agree. */
function rampUp(value: number, dt: number) {
  return Math.min(value + dt / KEY_RAMP_UP_S, 1)
}

/** SLOT. Key pedal decay after release. */
function rampDown(value: number) {
  const next = value * 0.9
  return next < 0.01 ? 0 : next
}

/**
 * Signed speed along the chassis forward axis (local −z, where the front wheels sit), m/s, forward positive.
 * Not `currentVehicleSpeed()`: in a headless test (Rapier 0.20) it stayed positive while the car drove backward.
 */
function forwardSpeed(body: RAPIER.RigidBody) {
  return dot(chassisAxes(body.rotation()).forward, body.linvel())
}

/** Scales engine force down to 0 as speed in the push direction nears that direction's top speed. */
function limitTopSpeed(engineForce: number, speed: number) {
  if (engineForce > 0) return engineForce * clamp((MAX_FORWARD_SPEED - speed) / TOP_SPEED_BAND, 0, 1)
  if (engineForce < 0) return engineForce * clamp((MAX_REVERSE_SPEED + speed) / TOP_SPEED_BAND, 0, 1)
  return engineForce
}

/** Maps pedal inputs to engine force (rear wheels) and brake impulse (all wheels). */
function resolveDrive(throttle: number, brake: number, reverse: boolean | undefined, speed: number) {
  if (reverse === false) return { engineForce: throttle * maxEngineForce, brakeForce: brake * BRAKE_FORCE }
  if (reverse === true) return { engineForce: throttle * minEngineForce, brakeForce: brake * BRAKE_FORCE }

  // Auto: the pedal against the direction of travel brakes; at a stop, the stronger pedal sets direction.
  if (speed > STOP_SPEED) return { engineForce: throttle * maxEngineForce, brakeForce: brake * BRAKE_FORCE }
  if (speed < -STOP_SPEED) return { engineForce: brake * minEngineForce, brakeForce: throttle * BRAKE_FORCE }
  return { engineForce: brake > throttle ? brake * minEngineForce : throttle * maxEngineForce, brakeForce: 0 }
}

export default function handleSteeringAndDrive(
  dt: number,
  body: RAPIER.RigidBody,
  pad: Pad,
  keys: Keys,
  vehicle: RAPIER.DynamicRayCastVehicleController,
) {
  const state = controllerStates.get(vehicle) ?? { steering: 0, keyThrottle: 0, keyBrake: 0 }
  let { steering, keyThrottle, keyBrake } = state
  let throttle: number
  let brake: number
  let reverse: boolean | undefined

  if (!pad.connected) {
    // Arrow keys will need the velocity of the body, to determine how quickly to adjust the steering
    const velocity = body.linvel()
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z)
    const steeringAdjustment = 0.07 / (speed + 1) // Adjust steering less based on higher speed
    if (keys.ArrowLeft || keys.KeyA) steering = Math.min(steering + steeringAdjustment, maxSteering)
    if (keys.ArrowRight || keys.KeyD) steering = Math.max(steering - steeringAdjustment, minSteering)
    if (!keys.ArrowLeft && !keys.KeyA && !keys.ArrowRight && !keys.KeyD) {
      steering *= 0.9 // Gradually reduce steering towards zero
    }

    // Ramped pedals: full force at once makes the tyres slide.
    keyThrottle = keys.ArrowUp || keys.KeyW ? rampUp(keyThrottle, dt) : rampDown(keyThrottle)
    keyBrake = keys.ArrowDown || keys.KeyS ? rampUp(keyBrake, dt) : rampDown(keyBrake)
    throttle = keyThrottle
    brake = keyBrake
    reverse = undefined // Keys are always auto.
  } else {
    steering = clamp(pad.steer, -1, 1) * maxSteering * -1
    throttle = clamp(pad.throttle, 0, 1)
    brake = clamp(pad.brake, 0, 1)
    reverse = pad.reverse
    // Drop key ramp state, so a later switch back to keys starts from rest, not from a stale held pedal.
    keyThrottle = 0
    keyBrake = 0
  }

  // Rapier applies a wheel's brake only while its engine force is 0, so rear brakes act only off-throttle.
  const speed = forwardSpeed(body)
  const drive = resolveDrive(throttle, brake, reverse, speed)
  const engineForce = limitTopSpeed(drive.engineForce, speed)
  const { brakeForce } = drive

  for (const i of engineWheels) vehicle.setWheelEngineForce(i, engineForce)
  for (let i = 0; i < wheelCount; i++) vehicle.setWheelBrake(i, brakeForce)
  for (const i of steerWheels) vehicle.setWheelSteering(i, steering)

  controllerStates.set(vehicle, { steering, keyThrottle, keyBrake })
  return { steering, engineForce, brakeForce }
}

/** Clears ramped key state and steering, and zeroes engine, brake, and steering on every wheel. Call on respawn. */
export function resetDriveState(vehicle: RAPIER.DynamicRayCastVehicleController) {
  controllerStates.delete(vehicle)
  for (let i = 0; i < vehicle.numWheels(); i++) {
    vehicle.setWheelEngineForce(i, 0)
    vehicle.setWheelBrake(i, 0)
    vehicle.setWheelSteering(i, 0)
  }
}
