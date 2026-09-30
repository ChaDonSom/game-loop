import * as THREE from "three"
import RAPIER from "@dimforge/rapier3d-compat"
import type { initWalls } from "@game-loop/shared"

type WallsPhysics = ReturnType<typeof initWalls>

export default function initWallsMeshes(scene: THREE.Scene, walls: WallsPhysics) {
  return walls.bodies.map((wallBody: RAPIER.RigidBody) => {
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(walls.length, walls.height, walls.thickness),
      new THREE.MeshStandardMaterial({ color: 0x444455 }),
    )
    wallMesh.position.copy(wallBody.translation())
    wallMesh.quaternion.copy(wallBody.rotation())
    wallMesh.receiveShadow = true
    scene.add(wallMesh)
    return wallMesh
  })
}
