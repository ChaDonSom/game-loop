import * as THREE from "three"
import type { initChassis } from "@game-loop/shared"

type ChassisPhysics = ReturnType<typeof initChassis>

export default function initChassisMesh(scene: THREE.Scene, chassis: ChassisPhysics) {
  const chassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(chassis.width, chassis.height, chassis.length),
    new THREE.MeshStandardMaterial({ color: 0xd9381e }),
  )
  chassisMesh.castShadow = true
  scene.add(chassisMesh)
  return chassisMesh
}
