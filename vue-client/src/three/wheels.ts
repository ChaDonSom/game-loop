import * as THREE from "three"

export default function initWheelMeshes(scene: THREE.Scene, radius: number) {
  const wheelWidth = 0.15
  const wheelGeometry = new THREE.CylinderGeometry(radius, radius, wheelWidth, 24)
  wheelGeometry.rotateZ(Math.PI / 2)
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 })
  const wheelMeshes: THREE.Mesh[] = []

  for (let index = 0; index < 4; index++) {
    const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheelMesh.castShadow = true
    scene.add(wheelMesh)
    wheelMeshes.push(wheelMesh)
  }

  return wheelMeshes
}
