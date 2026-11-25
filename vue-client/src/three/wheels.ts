import * as THREE from "three"
import { VEHICLE_DIMENSIONS } from "@game-loop/shared"

export default function initWheelMeshes(scene: THREE.Scene, radius: number) {
  const wheelWidth = VEHICLE_DIMENSIONS.wheel.width
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

const tempWheelPos = new THREE.Vector3()
/**
 * Moves the wheel meshes to their correct world coordinates based on the vehicle's current state and the drawn
 * chassis pose. Use the mesh pose, not the physics body: the mesh is the smoothed pose, and the wheels must match it.
 */
export function moveWheelMeshesToWorldCoordinates(
  vehicle: any,
  wheelMeshes: THREE.Mesh[],
  chassisMesh: THREE.Mesh,
  steering: number,
) {
  const tempChassisQuat = chassisMesh.quaternion
  for (let i = 0; i < vehicle.numWheels(); i++) {
    const connectionPoint = vehicle.wheelChassisConnectionPointCs(i)
    const suspensionLength = vehicle.wheelSuspensionLength(i)
    if (suspensionLength === null || connectionPoint === null) continue

    // Start at the suspension attachment point and move
    // down along the suspension direction.
    tempWheelPos.set(connectionPoint.x, connectionPoint.y - suspensionLength, connectionPoint.z)

    // Convert chassis-local position into world space.
    tempWheelPos.applyQuaternion(tempChassisQuat)
    tempWheelPos.add(chassisMesh.position)
    wheelMeshes[i]?.position.copy(tempWheelPos)

    // Start with the chassis orientation.
    wheelMeshes[i]?.quaternion.copy(tempChassisQuat)

    // Front wheels steer relative to the chassis.
    if (i < 2) {
      const steeringQuat = new THREE.Quaternion()
      steeringQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering)
      wheelMeshes[i]?.quaternion.multiply(steeringQuat)
    }
  }
}
