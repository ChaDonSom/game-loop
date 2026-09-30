import * as THREE from "three"
import type { ramp } from "@game-loop/shared"

type RampPhysics = ReturnType<typeof ramp>

export default function initRamp(scene: THREE.Scene, rampPhysics: RampPhysics) {
  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(rampPhysics.width, rampPhysics.height, rampPhysics.length),
    new THREE.MeshStandardMaterial({ color: 0x444455 }),
  )
  rampMesh.position.copy(rampPhysics.body.translation())
  rampMesh.quaternion.copy(rampPhysics.body.rotation())
  rampMesh.receiveShadow = true
  scene.add(rampMesh)
  return rampMesh
}
