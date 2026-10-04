import RAPIER from "@dimforge/rapier3d-compat"

export default function initChassis(world: RAPIER.World, spawnIndex = 0) {
  const chassisWidth = 1.2,
    chassisHeight = 0.4,
    chassisLength = 2.4

  // Dynamic rigid body positioned at the top of the ramp
  const chassisBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnIndex * 3, 7, -12)
    .setRotation({ x: 0, y: 1, z: 0.2, w: 0 }) // Quarternions: an imaginary vector, x,y,z, and the real component w
  // which sets how far the rotation is around the axis defined by the imaginary vector (x, y, z), in radians
  const chassisBody = world.createRigidBody(chassisBodyDesc)

  const chassisColliderDesc = RAPIER.ColliderDesc.cuboid(
    chassisWidth / 2,
    chassisHeight / 2,
    chassisLength / 2,
  ).setDensity(2.0) // Increase density to give the soapbox momentum
  world.createCollider(chassisColliderDesc, chassisBody)

  return {
    body: chassisBody,
    width: chassisWidth,
    height: chassisHeight,
    length: chassisLength,
  }
}
