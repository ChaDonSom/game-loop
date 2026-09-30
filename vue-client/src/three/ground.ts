import * as THREE from "three"

export default function initGround(scene: THREE.Scene) {
  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1000, 1, 1000),
    new THREE.MeshStandardMaterial({ color: 0x22222b }),
  )
  groundMesh.position.set(0, -0.5, 0)
  groundMesh.receiveShadow = true
  scene.add(groundMesh)
  return groundMesh
}
