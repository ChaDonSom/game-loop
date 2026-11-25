import RAPIER from "@dimforge/rapier3d-compat"
import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"

export default function initWheels(
  chassis: { body: RAPIER.RigidBody; width: number; height: number; length: number },
  vehicle: RAPIER.DynamicRayCastVehicleController,
) {
  const { radius: wheelRadius, width: wheelWidth, suspensionRestLength } = VEHICLE_DIMENSIONS.wheel

  // Relative attachment points for 4 wheels on the chassis [X, Y, Z]
  const wheelOffsets = [
    new RAPIER.Vector3(chassis.width / 2, -chassis.height / 6, -chassis.length / 3), // Front-Right
    new RAPIER.Vector3(-chassis.width / 2, -chassis.height / 6, -chassis.length / 3), // Front-Left
    new RAPIER.Vector3(chassis.width / 2, -chassis.height / 6, chassis.length / 3), // Rear-Right
    new RAPIER.Vector3(-chassis.width / 2, -chassis.height / 6, chassis.length / 3), // Rear-Left
  ]

  wheelOffsets.forEach((offset, i) => {
    // Add wheel to raycast vehicle controller
    // Arguments: connectionPoint, direction (down), axle (X-axis), suspensionRestLength, radius
    vehicle.addWheel(
      offset,
      new RAPIER.Vector3(0, -1, 0),
      new RAPIER.Vector3(1, 0, 0),
      suspensionRestLength,
      wheelRadius,
    ) // i's 0 and 1 are the front wheels for steering

    // Configure wheel suspension & friction properties
    vehicle.setWheelSuspensionStiffness(i, 40.0)
    vehicle.setWheelFrictionSlip(i, 5.0) // Side slip traction. applySurfaceGrip overrides it each step.
  })

  return {
    radius: wheelRadius,
    width: wheelWidth,
    suspensionRestLength,
    offset: wheelOffsets,
  }
}
