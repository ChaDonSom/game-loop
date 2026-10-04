import * as THREE from "three"

// For following the car
const cameraPosition = new THREE.Vector3()
const cameraLookAt = new THREE.Vector3()
const carForward = new THREE.Vector3()

export default function updateCamera(chassisMesh: THREE.Mesh, camera: THREE.Camera) {
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

  camera.position.lerp(cameraPosition, 0.1)

  // Look toward the car, but from world-up orientation.
  cameraLookAt.copy(chassisMesh.position)
  cameraLookAt.y += 1

  camera.lookAt(cameraLookAt)
}
