import RAPIER from "@dimforge/rapier3d-compat"

export default function initWalls(world: RAPIER.World) {
  const wallHeight = 4,
    wallThickness = 1,
    wallLength = 1000
  const wallBodies: RAPIER.RigidBody[] = []

  const createWall = (x: number, y: number, z: number, rotY = 0) => {
    const halfAngle = rotY / 2
    const rotation = {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    }

    const wallBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(rotation)

    const wallBody = world.createRigidBody(wallBodyDesc)
    world.createCollider(RAPIER.ColliderDesc.cuboid(wallLength / 2, wallHeight / 2, wallThickness / 2), wallBody)
    wallBodies.push(wallBody)
  }

  // Create four walls around the ground plane
  const degToRad = (deg: number) => (deg * Math.PI) / 180
  createWall(0, wallHeight / 2, -500) // Back wall
  createWall(0, wallHeight / 2, 500) // Front wall
  createWall(-500, wallHeight / 2, 0, degToRad(90)) // Left wall
  createWall(500, wallHeight / 2, 0, degToRad(90)) // Right wall

  return {
    createWall,
    height: wallHeight,
    thickness: wallThickness,
    length: wallLength,
    bodies: wallBodies,
  }
}
