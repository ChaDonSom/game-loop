import RAPIER from "@dimforge/rapier3d-compat"

export default function ramp(world: RAPIER.World) {
  const rampWidth = 6,
    rampHeight = 0.2,
    rampLength = 22
  const rampBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, 2, -5)
    .setRotation({ x: 0.25, y: 0, z: 0, w: 0.968 })

  const rampBody = world.createRigidBody(rampBodyDesc)
  world.createCollider(RAPIER.ColliderDesc.cuboid(rampWidth / 2, rampHeight / 2, rampLength / 2), rampBody)

  return {
    width: rampWidth,
    height: rampHeight,
    length: rampLength,
    body: rampBody,
  }
}
