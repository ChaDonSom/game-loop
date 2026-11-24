import * as THREE from "three"

const GROUND_SIZE = 1000
/** Width of one checker tile, in metres. A visible pattern shows speed and slope. */
const TILE_SIZE = 4

function createCheckerTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 64
  const context = canvas.getContext("2d")
  if (context) {
    context.fillStyle = "#9aa0a8"
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = "#8a9098"
    context.fillRect(0, 0, 32, 32)
    context.fillRect(32, 32, 32, 32)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  // One texture holds 2×2 tiles.
  texture.repeat.set(GROUND_SIZE / (TILE_SIZE * 2), GROUND_SIZE / (TILE_SIZE * 2))
  texture.anisotropy = 8
  return texture
}

export default function initGround(scene: THREE.Scene) {
  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.9 }),
  )
  groundMesh.position.set(0, -0.5, 0)
  groundMesh.receiveShadow = true
  scene.add(groundMesh)
  return groundMesh
}
