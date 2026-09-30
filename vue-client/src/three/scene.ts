import * as THREE from "three"

export function initScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a24)
  return scene
}

export function initCamera() {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 8, 18)
  return camera
}

export function initRenderer(container: HTMLElement | null) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  container?.appendChild(renderer.domElement)
  return renderer
}

export function initLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
  directionalLight.position.set(10, 20, 10)
  directionalLight.castShadow = true
  scene.add(directionalLight)
  return directionalLight
}
