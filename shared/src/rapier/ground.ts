import RAPIER from "@dimforge/rapier3d-compat"

export default function initGround(world: RAPIER.World) {
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500), groundBody)

  return {
    body: groundBody,
  }
}
