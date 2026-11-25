import * as THREE from "three"

// For following the car
const cameraPosition = new THREE.Vector3()
const cameraLookAt = new THREE.Vector3()
const smoothedLookAt = new THREE.Vector3()
const carForward = new THREE.Vector3()
let hasLookAt = false

/** How fast the camera catches up, per second. Higher is stiffer. 6.3/s is the old 0.1-per-frame lerp at 60 fps. */
const POSITION_RATE = 6.3
/**
 * The camera used to aim at the exact car position. A small jump of the car (a server correction, a suspension
 * bounce) then tilted the whole view at once. Smooth the aim point too, a little more in height.
 */
const LOOK_RATE = 12
const LOOK_HEIGHT_RATE = 6

/** Frame-rate independent lerp factor. */
function follow(rate: number, dt: number) {
  return 1 - Math.exp(-rate * dt)
}

export default function updateCamera(chassisMesh: THREE.Mesh, camera: THREE.Camera, dt: number) {
  // Camera follows the car
  // Get the car's forward direction.
  // Your chassis length is along Z, so local forward is -Z.
  carForward.set(0, 0, -1)
  carForward.applyQuaternion(chassisMesh.quaternion)

  // Ignore the car's pitch/roll.
  // This keeps the camera upright relative to world Y.
  carForward.y = 0
  carForward.normalize()

  // Camera sits behind and above the car.
  cameraPosition.copy(chassisMesh.position)
  cameraPosition.addScaledVector(carForward, -10)
  cameraPosition.y += 5

  camera.position.lerp(cameraPosition, follow(POSITION_RATE, dt))

  // Look toward the car, but from world-up orientation.
  cameraLookAt.copy(chassisMesh.position)
  cameraLookAt.y += 1

  if (!hasLookAt) {
    smoothedLookAt.copy(cameraLookAt)
    hasLookAt = true
  }
  const look = follow(LOOK_RATE, dt)
  smoothedLookAt.x += (cameraLookAt.x - smoothedLookAt.x) * look
  smoothedLookAt.z += (cameraLookAt.z - smoothedLookAt.z) * look
  smoothedLookAt.y += (cameraLookAt.y - smoothedLookAt.y) * follow(LOOK_HEIGHT_RATE, dt)

  camera.lookAt(smoothedLookAt)
}
