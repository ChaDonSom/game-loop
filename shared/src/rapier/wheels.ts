import RAPIER from "@dimforge/rapier3d-compat"
import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"

/** Distance from the chassis center to each axle, along the chassis. Front = −z (the nose). */
export function axleOffsetZ(chassisLength: number) {
  return chassisLength / 3
}

export default function initWheels(
  chassis: { body: RAPIER.RigidBody; width: number; height: number; length: number },
  vehicle: RAPIER.DynamicRayCastVehicleController,
) {
  const { radius: wheelRadius, width: wheelWidth, suspensionRestLength, rayOutward } = VEHICLE_DIMENSIONS.wheel

  // Hubs: where each tire is centered and drawn. Order: front-right, front-left, rear-right, rear-left.
  const hubX = chassis.width / 2
  const hubY = -chassis.height / 6
  const hubOffsets = [
    { x: hubX, y: hubY, z: -axleOffsetZ(chassis.length) },
    { x: -hubX, y: hubY, z: -axleOffsetZ(chassis.length) },
    { x: hubX, y: hubY, z: axleOffsetZ(chassis.length) },
    { x: -hubX, y: hubY, z: axleOffsetZ(chassis.length) },
  ]
  // Rays: same as the hubs, moved out across the tire (see `rayOutward`).
  const rayShift = (rayOutward * wheelWidth) / 2
  const wheelOffsets = hubOffsets.map((hub) => new RAPIER.Vector3(hub.x + Math.sign(hub.x) * rayShift, hub.y, hub.z))

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
    /** Ray attachment points (chassis frame). */
    offset: wheelOffsets,
    /** Tire centers (chassis frame). Draw the tires here, not at the rays. */
    hubOffset: hubOffsets,
  }
}
