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
  resetChassisToSpawn,
  resetDriveState,
  buildTerrainPhysics,
  applySurfaceGrip,
  frontAxleSlip,
  isStuckUpsideDown,
  flipUpright,
  DEFAULT_WORLD,
} from "@game-loop/shared"
import {
  initCamera,
  initChassis as initChassisMesh,
  initGround as initGroundMesh,
  initLights,
  followWithSun,
  initRamp as initRampMesh,
  initRenderer,
  initScene,
  initWalls as initWallMeshes,
  initWheels as initWheelMeshes,
  buildTerrainMeshes,
} from "./three"
import getGamePadState, { gamepadButtonHeld } from "@/input/pad"
import {
  GAMEPAD_FLIP_BUTTON,
  getFlipCount,
  pollGamepadFlip,
  resetFlip,
  takeFlipPress,
  updateCanFlip,
} from "@/input/flip"
import keys from "@/input/keys"
import { frontRolling, getTouchPad, resetWheel, touchVisible, updateWheel } from "@/input/touch"
import { moveWheelMeshesToWorldCoordinates } from "@/three/wheels"
import updateCamera from "@/three/camera"
import { lastSentSeq, queueControls, stateLagSeconds } from "@/network"
import { authoritativePlayers, myId, mySpawnIndex, worldMismatch } from "@/store/network"
import reconcile from "@/physics/reconcile"
import RenderSmoothing from "@/physics/renderSmoothing"
import { perfEnabled, recordFrame, setPerfExtra } from "@/debug/perfHud"
import { initQuality, qualitySetting } from "@/three/quality"
import { watch } from "vue"

async function init() {
  const { world } = await initRapier()

  // ----------------------------------------------------
  // #region 1. THREE.JS SCENE SETUP
  // ----------------------------------------------------
  const container = document.getElementById("canvas-container")
  const scene = initScene()
  const camera = initCamera()

  const renderer = initRenderer(container)

  const sun = initLights(scene)
  const quality = initQuality(renderer, scene, sun)
  watch(qualitySetting.value, () => quality.sync())
  setPerfExtra(() => `quality  ${quality.describe()}`)

  const ramp = createRamp(world)
  initRampMesh(scene, ramp)

  initGround(world)
  initGroundMesh(scene)

  const walls = initWalls(world)
  initWallMeshes(scene, walls)

  const terrain = buildTerrainPhysics(world, DEFAULT_WORLD.layout)
  buildTerrainMeshes(scene, terrain)

  const chassis = initChassis(world)
  const chassisMesh = initChassisMesh(scene, chassis)

  const vehicle = world.createVehicleController(chassis.body)

  const wheelConfig = initWheels(chassis, vehicle)
  const { radius: wheelRadius } = wheelConfig
  const wheelMeshes = initWheelMeshes(scene, wheelRadius)
  const remoteChassisMeshes = new Map<string, { mesh: THREE.Mesh; wheels: THREE.Mesh[] }>()
  const remoteChassisMaterial = new THREE.MeshStandardMaterial({ color: 0x2768c7 })
  const steeringAxis = new THREE.Vector3(0, 1, 0)

  // ----------------------------------------------------
  // #region 2. ANIMATION LOOP
  // ----------------------------------------------------
  const fixedDt = 1 / 60
  let lastFrameTime = performance.now()
  let accumulator = 0
  let lastReconciledAck = 0
  /**
   * Server states with an `ack` below this are older than the last local flip. They still show the car on its roof, so
   * a correction toward them would undo the flip for one round trip.
   */
  let firstAckAfterFlip = 0
  let steering = 0
  /** Session (`myId`) whose spawn the local car was last reset to. Each `welcome` gives a new id. */
  let spawnedForId: string | null = null
  const smoothing = new RenderSmoothing(chassis.body)

  function animate(currentTime: number) {
    requestAnimationFrame(animate)
    const jsStart = performance.now()
    const interval = currentTime - lastFrameTime
    const frameDt = Math.min((currentTime - lastFrameTime) / 1000, 0.1)
    lastFrameTime = currentTime
    accumulator += frameDt
    // Server runs a different world: local prediction would be wrong, so freeze it.
    if (worldMismatch.value) accumulator = 0

    // Start where the server put this car. The client does not know its slot until `welcome` arrives. Reset once per
    // session: a reconnect can get the same slot again, and the server car then starts fresh at it.
    if (myId.value !== null && mySpawnIndex.value !== null && myId.value !== spawnedForId) {
      resetChassisToSpawn(chassis.body, mySpawnIndex.value)
      resetDriveState(vehicle)
      resetWheel()
      resetFlip()
      smoothing.reset()
      spawnedForId = myId.value
      lastReconciledAck = 0
      firstAckAfterFlip = 0
    }

    const physicsStart = performance.now()
    while (accumulator >= fixedDt) {
      // Center the touch wheel every step, so it is centered when touch comes back after the gamepad.
      // The released wheel turns toward the front axle's direction of travel (countersteer in a slide).
      updateWheel(fixedDt, frontRolling(vehicle, fixedDt, wheelRadius), frontAxleSlip(chassis.body))
      const gamepad = getGamePadState()
      if (gamepad.connected && touchVisible.value) touchVisible.value = false
      const pad = gamepad.connected ? gamepad : touchVisible.value ? getTouchPad() : gamepad
      const currentKeys = { ...keys }

      // A flip press goes to the server in `controls`. The server runs the same rule on the same step.
      pollGamepadFlip(gamepad.connected && gamepadButtonHeld(GAMEPAD_FLIP_BUTTON))
      if (takeFlipPress() && isStuckUpsideDown(chassis.body) && flipUpright(world, chassis.body)) {
        firstAckAfterFlip = lastSentSeq() + 1
        resetDriveState(vehicle)
        resetWheel()
        smoothing.reset()
      }
      updateCanFlip(fixedDt, isStuckUpsideDown(chassis.body))

      queueControls({ keys: currentKeys, pad, flip: getFlipCount() })
      steering = handleSteeringAndDrive(fixedDt, chassis.body, pad, currentKeys, vehicle).steering

      applySurfaceGrip(vehicle, terrain, DEFAULT_WORLD.surfaceGrip)
      vehicle.updateVehicle(fixedDt)
      smoothing.beforeStep()
      world.step()
      smoothing.afterStep()
      accumulator -= fixedDt
    }
    const physicsMs = performance.now() - physicsStart

    const localSnapshot = myId.value ? authoritativePlayers.value[myId.value] : undefined
    if (localSnapshot && localSnapshot.ack > lastReconciledAck && localSnapshot.ack >= firstAckAfterFlip) {
      const lag = stateLagSeconds(localSnapshot.ack, localSnapshot.ackAgeMs) ?? 0
      smoothing.beginCorrection()
      reconcile(chassis.body, localSnapshot, lag)
      smoothing.endCorrection()
      lastReconciledAck = localSnapshot.ack
    }

    const activeRemoteIds = new Set<string>()
    for (const [id, snapshot] of Object.entries(authoritativePlayers.value)) {
      if (id === myId.value) continue
      activeRemoteIds.add(id)

      let remoteVehicle = remoteChassisMeshes.get(id)
      if (!remoteVehicle) {
        const remoteMesh = new THREE.Mesh(chassisMesh.geometry, remoteChassisMaterial)
        remoteMesh.castShadow = true
        remoteMesh.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z)
        remoteMesh.quaternion.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w)
        scene.add(remoteMesh)

        const remoteWheelMeshes: THREE.Mesh[] = []
        for (const [index, offset] of wheelConfig.offset.entries()) {
          const localWheelMesh = wheelMeshes[index]
          if (!localWheelMesh) continue

          const remoteWheelMesh = localWheelMesh.clone()
          remoteWheelMesh.position.set(offset.x, offset.y - wheelConfig.suspensionRestLength, offset.z)
          remoteWheelMesh.quaternion.identity()
          remoteMesh.add(remoteWheelMesh)
          remoteWheelMeshes.push(remoteWheelMesh)
        }

        remoteVehicle = { mesh: remoteMesh, wheels: remoteWheelMeshes }
        remoteChassisMeshes.set(id, remoteVehicle)
      }

      remoteVehicle.mesh.position.lerp(
        new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z),
        0.25,
      )
      remoteVehicle.mesh.quaternion.slerp(
        new THREE.Quaternion(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w),
        0.25,
      )
      for (const wheelIndex of [0, 1]) {
        remoteVehicle.wheels[wheelIndex]?.quaternion.setFromAxisAngle(steeringAxis, snapshot.steering)
      }
    }

    for (const [id, remoteVehicle] of remoteChassisMeshes) {
      if (activeRemoteIds.has(id)) continue
      scene.remove(remoteVehicle.mesh)
      remoteChassisMeshes.delete(id)
    }

    // Draw a blend of the last two physics steps, plus the fading correction offset. See RenderSmoothing.
    smoothing.sample(accumulator / fixedDt, frameDt, chassisMesh.position, chassisMesh.quaternion)

    updateCamera(chassisMesh, camera, frameDt)
    followWithSun(sun, chassisMesh.position)

    moveWheelMeshesToWorldCoordinates(vehicle, wheelMeshes, chassisMesh, steering)

    const renderStart = performance.now()
    renderer.render(scene, camera)
    const end = performance.now()
    if (perfEnabled) recordFrame({
      interval,
      physics: physicsMs,
      render: end - renderStart,
      total: end - jsStart,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    })
    quality.frame(interval)
  }

  animate(performance.now())

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

init()
