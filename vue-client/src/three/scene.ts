import * as THREE from "three"

const SKY_COLOR = 0xa9d2f0
const GROUND_BOUNCE_COLOR = 0x6b6350

/** Sun position relative to the point it lights. The sun moves with that point. */
const SUN_OFFSET = new THREE.Vector3(20, 40, 15)
/**
 * The arena is 1000 m square (walls at ±500 m), so the farthest wall can be ~1414 m away.
 * Fog and the camera far plane reach past that. Fog only softens the far side; you can still see far cars.
 */
const VIEW_DISTANCE = 1500
/** Half-size of the shadow area around the sun target, in metres. */
const SHADOW_EXTENT = 40

export function initScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY_COLOR)
  // Light fog over the whole arena. It gives depth but keeps the far walls and far cars visible.
  scene.fog = new THREE.Fog(SKY_COLOR, 200, VIEW_DISTANCE)
  return scene
}

export function initCamera() {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, VIEW_DISTANCE)
  camera.position.set(0, 8, 18)
  return camera
}

export function initRenderer(container: HTMLElement | null) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container?.appendChild(renderer.domElement)
  return renderer
}

export function initLights(scene: THREE.Scene) {
  // Sky light from above, ground bounce from below. Faces that point away from the sun still show shape.
  scene.add(new THREE.HemisphereLight(SKY_COLOR, GROUND_BOUNCE_COLOR, 1.4))

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4)
  sun.position.copy(SUN_OFFSET)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -SHADOW_EXTENT
  sun.shadow.camera.right = SHADOW_EXTENT
  sun.shadow.camera.top = SHADOW_EXTENT
  sun.shadow.camera.bottom = -SHADOW_EXTENT
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 150
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  scene.add(sun)
  scene.add(sun.target)
  return sun
}

/** Keep the sun and its shadow area centred on a point, for example the local car. */
export function followWithSun(sun: THREE.DirectionalLight, point: THREE.Vector3) {
  sun.target.position.copy(point)
  sun.position.copy(point).add(SUN_OFFSET)
}
