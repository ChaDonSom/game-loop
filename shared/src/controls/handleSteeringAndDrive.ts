import RAPIER from "@dimforge/rapier3d-compat"
import { Keys, Pad } from "./types.js"
import { clamp } from "../math.js"

const maxEngineForce = 25
const minEngineForce = -25
const maxSteering = 0.45
const minSteering = -0.45
const controllerStates = new WeakMap<
  RAPIER.DynamicRayCastVehicleController,
  { engineForce: number; steering: number }
>()

export default function handleSteeringAndDrive(
  dt: number,
  body: RAPIER.RigidBody,
  pad: Pad,
  keys: Keys,
  vehicle: RAPIER.DynamicRayCastVehicleController,
) {
  const state = controllerStates.get(vehicle) ?? { engineForce: 0, steering: 0 }
  let { engineForce, steering } = state
  const connected = pad.connected
  const steerInput = clamp(pad.steer, -1, 1)
  const throttleInput = clamp(pad.throttle, 0, 1)
  const brakeInput = clamp(pad.brake, 0, 1)

  if (!connected) {
    // Arrow keys will need the velocity of the body, to determine how quickly to adjust the steering
    const velocity = body.linvel() // Get the current velocity of the body
    // Get speed from velocity, velocity is just { x, y, z }
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z) // Calculate the speed of the body
    const steeringAdjustment = 0.07 / (speed + 1) // Adjust steering less based on higher speed
    if (keys.ArrowLeft || keys.KeyA) steering = Math.min(steering + steeringAdjustment, maxSteering)
    if (keys.ArrowRight || keys.KeyD) steering = Math.max(steering - steeringAdjustment, minSteering)
    if (!keys.ArrowLeft && !keys.KeyA && !keys.ArrowRight && !keys.KeyD) {
      // Gradually reduce steering to zero when no left/right keys are pressed
      steering *= 0.9 // Gradually reduce steering towards zero
    }

    // Throttle/brake rear wheels (Index 2 and 3)
    if (keys.ArrowUp || keys.KeyW) engineForce = Math.min(engineForce + 0.1, maxEngineForce)
    if (keys.ArrowDown || keys.KeyS) engineForce = Math.max(engineForce - 0.1, minEngineForce)
    if (!keys.ArrowUp && !keys.KeyW && !keys.ArrowDown && !keys.KeyS) {
      // Gradually reduce engine force to zero when no throttle or brake keys are pressed
      engineForce *= 0.9 // Gradually reduce engine force towards zero
    }
  } else {
    // Gamepad controls
    steering = steerInput * maxSteering * -1

    // Throttle/brake rear wheels (Index 2 and 3)
    engineForce = throttleInput * maxEngineForce
    if (brakeInput > 0) engineForce = Math.max(engineForce - brakeInput * maxEngineForce, minEngineForce)
  }

  vehicle.setWheelEngineForce(2, engineForce)
  vehicle.setWheelEngineForce(3, engineForce)

  vehicle.setWheelSteering(0, steering)
  vehicle.setWheelSteering(1, steering)

  controllerStates.set(vehicle, { engineForce, steering })
  return { steering, engineForce }
}
