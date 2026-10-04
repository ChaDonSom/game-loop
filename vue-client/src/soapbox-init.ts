import * as THREE from "three"
import RAPIER from "@dimforge/rapier3d-compat"
import {
  initRapier,
  ramp as createRamp,
  initGround,
  initWalls,
  initChassis,
  initWheels,
  handleSteeringAndDrive,
} from "@game-loop/shared"
import {
  initCamera,
  initChassis as initChassisMesh,
  initGround as initGroundMesh,
  initLights,
  initRamp as initRampMesh,
  initRenderer,
  initScene,
  initWalls as initWallMeshes,
  initWheels as initWheelMeshes,
} from "./three"
import getGamePadState from "@/input/pad"
import keys from "@/input/keys"
import { moveWheelMeshesToWorldCoordinates } from "@/three/wheels"
import updateCamera from "@/three/camera"
import { queueControls } from "@/network"
import { authoritativePlayers, myId } from "@/store/network"

async function init() {
  const { world } = await initRapier()

  // ----------------------------------------------------
  // #region 1. THREE.JS SCENE SETUP
  // ----------------------------------------------------
  const container = document.getElementById("canvas-container")
  const scene = initScene()
  const camera = initCamera()

  const renderer = initRenderer(container)

  initLights(scene)

  const ramp = createRamp(world)
  initRampMesh(scene, ramp)

  initGround(world)
  initGroundMesh(scene)

  const walls = initWalls(world)
  initWallMeshes(scene, walls)

  const chassis = initChassis(world)
  const chassisMesh = initChassisMesh(scene, chassis)

  const vehicle = world.createVehicleController(chassis.body)

  const { radius: wheelRadius } = initWheels(chassis, vehicle)
  const wheelMeshes = initWheelMeshes(scene, wheelRadius)
  const remoteChassisMeshes = new Map<string, THREE.Mesh>()
  const remoteChassisMaterial = new THREE.MeshStandardMaterial({ color: 0x2768c7 })

  // ----------------------------------------------------
  // #region 2. ANIMATION LOOP
  // ----------------------------------------------------
  const fixedDt = 1 / 60
  let lastFrameTime = performance.now()
  let accumulator = 0
  let lastReconciledAck = 0
  let steering = 0

  function animate(currentTime: number) {
    requestAnimationFrame(animate)
    const frameDt = Math.min((currentTime - lastFrameTime) / 1000, 0.1)
    lastFrameTime = currentTime
    accumulator += frameDt

    while (accumulator >= fixedDt) {
      const pad = getGamePadState()
      const currentKeys = { ...keys }
      queueControls({ keys: currentKeys, pad })
      steering = handleSteeringAndDrive(fixedDt, chassis.body, pad, currentKeys, vehicle).steering

      vehicle.updateVehicle(fixedDt)
      world.step()
      accumulator -= fixedDt
    }

    const localSnapshot = myId.value ? authoritativePlayers.value[myId.value] : undefined
    if (localSnapshot && localSnapshot.ack > lastReconciledAck) {
      const position = chassis.body.translation()
      chassis.body.setTranslation(
        {
          x: THREE.MathUtils.lerp(position.x, localSnapshot.position.x, 0.2),
          y: THREE.MathUtils.lerp(position.y, localSnapshot.position.y, 0.2),
          z: THREE.MathUtils.lerp(position.z, localSnapshot.position.z, 0.2),
        },
        true,
      )

      const rotation = chassis.body.rotation()
      const correctedRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
      correctedRotation.slerp(
        new THREE.Quaternion(
          localSnapshot.rotation.x,
          localSnapshot.rotation.y,
          localSnapshot.rotation.z,
          localSnapshot.rotation.w,
        ),
        0.2,
      )
      chassis.body.setRotation(
        { x: correctedRotation.x, y: correctedRotation.y, z: correctedRotation.z, w: correctedRotation.w },
        true,
      )

      const velocity = chassis.body.linvel()
      chassis.body.setLinvel(
        {
          x: THREE.MathUtils.lerp(velocity.x, localSnapshot.velocity.x, 0.2),
          y: THREE.MathUtils.lerp(velocity.y, localSnapshot.velocity.y, 0.2),
          z: THREE.MathUtils.lerp(velocity.z, localSnapshot.velocity.z, 0.2),
        },
        true,
      )
      lastReconciledAck = localSnapshot.ack
    }

    const activeRemoteIds = new Set<string>()
    for (const [id, snapshot] of Object.entries(authoritativePlayers.value)) {
      if (id === myId.value) continue
      activeRemoteIds.add(id)

      let remoteMesh = remoteChassisMeshes.get(id)
      if (!remoteMesh) {
        remoteMesh = new THREE.Mesh(chassisMesh.geometry, remoteChassisMaterial)
        remoteMesh.castShadow = true
        remoteMesh.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)
        remoteMesh.quaternion.set(
          snapshot.rotation.x,
          snapshot.rotation.y,
          snapshot.rotation.z,
          snapshot.rotation.w,
        )
        scene.add(remoteMesh)
        remoteChassisMeshes.set(id, remoteMesh)
      }

      remoteMesh.position.lerp(new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z), 0.25)
      remoteMesh.quaternion.slerp(
        new THREE.Quaternion(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w),
        0.25,
      )
    }

    for (const [id, remoteMesh] of remoteChassisMeshes) {
      if (activeRemoteIds.has(id)) continue
      scene.remove(remoteMesh)
      remoteChassisMeshes.delete(id)
    }

    // Update chassis visual position
    const cPos = chassis.body.translation()
    const cRot = chassis.body.rotation()
    chassisMesh.position.set(cPos.x, cPos.y, cPos.z)
    chassisMesh.quaternion.set(cRot.x, cRot.y, cRot.z, cRot.w)

    updateCamera(chassisMesh, camera)

    moveWheelMeshesToWorldCoordinates(vehicle, wheelMeshes, { body: chassis.body, mesh: chassisMesh }, steering)

    renderer.render(scene, camera)
  }

  animate(performance.now())

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

init()
