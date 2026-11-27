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
  tryFlip,
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
import getGamePadState, { gamepadFlipHeld } from "@/input/pad"
import {
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
import RemoteCar from "@/physics/remoteCar"
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
  /** Each remote car: a physics proxy the local car can hit (issue 13), and the meshes drawn at its pose. */
  const remoteCars = new Map<
    string,
    { car: RemoteCar; smoothing: RenderSmoothing; mesh: THREE.Mesh; wheels: THREE.Mesh[] }
  >()
  const remoteChassisMaterial = new THREE.MeshStandardMaterial({ color: 0x2768c7 })
  const steeringAxis = new THREE.Vector3(0, 1, 0)

  // ----------------------------------------------------
  // #region 2. ANIMATION LOOP
  // ----------------------------------------------------
  const fixedDt = 1 / 60
  let lastFrameTime = performance.now()
  let accumulator = 0
  /** Server states with an `ack` at or below this are not used. Raised after a local teleport (flip). */
  let lastReconciledAck = 0
  let steering = 0
  /** Session (`myId`) whose spawn the local car was last reset to. Each `welcome` gives a new id. */
  let spawnedForId: string | null = null
  const smoothing = new RenderSmoothing(chassis.body)
  /**
   * How far the local car runs ahead of server states, in seconds, measured when the last local state arrived. A
   * remote car's state is as old as the local car's state of the same tick, so it is moved forward by this plus its
   * time since arrival.
   */
  let predictionLead = 0
  let predictionLeadSeq = -1

  /**
   * After the local car jumps (respawn, flip): reset the wheel and the render history, and skip server states at or
   * below `ackFloor`. Those states come from before the jump, so a correction toward them would undo it.
   */
  function afterTeleport(ackFloor: number) {
    resetWheel()
    smoothing.reset()
    lastReconciledAck = ackFloor
  }

  /** Adds a proxy and meshes for each new remote car, and removes those of cars that left. */
  function syncRemoteCars() {
    for (const [id, snapshot] of Object.entries(authoritativePlayers.value)) {
      if (id === myId.value || remoteCars.has(id)) continue

      const mesh = new THREE.Mesh(chassisMesh.geometry, remoteChassisMaterial)
      mesh.castShadow = true
      scene.add(mesh)

      const wheels: THREE.Mesh[] = []
      for (const [index, offset] of wheelConfig.offset.entries()) {
        const localWheelMesh = wheelMeshes[index]
        if (!localWheelMesh) continue

        const remoteWheelMesh = localWheelMesh.clone()
        remoteWheelMesh.position.set(offset.x, offset.y - wheelConfig.suspensionRestLength, offset.z)
        remoteWheelMesh.quaternion.identity()
        mesh.add(remoteWheelMesh)
        wheels.push(remoteWheelMesh)
      }

      const car = new RemoteCar(world)
      // Place it now (the first `follow` snaps), so the smoothing starts at the car and not at the origin.
      car.follow(snapshot, predictionLead + (performance.now() - snapshot.time) / 1000, fixedDt)
      remoteCars.set(id, { car, smoothing: new RenderSmoothing(car.body), mesh, wheels })
    }

    for (const [id, remote] of remoteCars) {
      if (id !== myId.value && authoritativePlayers.value[id]) continue
      scene.remove(remote.mesh)
      remote.car.remove(world)
      remoteCars.delete(id)
    }
  }

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
      resetFlip()
      afterTeleport(0)
      spawnedForId = myId.value
    }

    syncRemoteCars()

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
      pollGamepadFlip(gamepadFlipHeld())
      // The press goes out with the next `controls`. States acking anything sent before it predate the flip.
      if (takeFlipPress() && tryFlip(world, chassis.body, vehicle)) {
        afterTeleport(Math.max(lastReconciledAck, lastSentSeq()))
      }
      updateCanFlip(fixedDt, isStuckUpsideDown(chassis.body))

      queueControls({ keys: currentKeys, pad, flip: getFlipCount() })
      steering = handleSteeringAndDrive(fixedDt, chassis.body, pad, currentKeys, vehicle).steering

      applySurfaceGrip(vehicle, terrain, DEFAULT_WORLD.surfaceGrip)
      vehicle.updateVehicle(fixedDt)
      // This step ends at local time `jsStart - (accumulator - fixedDt)`. Move remote cars to that time.
      const stepEndBehindNow = accumulator - fixedDt
      for (const [id, remote] of remoteCars) {
        const snapshot = authoritativePlayers.value[id]
        if (!snapshot) continue
        const ahead = predictionLead + (jsStart - snapshot.time) / 1000 - stepEndBehindNow
        if (remote.car.follow(snapshot, ahead, fixedDt)) remote.smoothing.reset()
        remote.smoothing.beforeStep()
      }
      smoothing.beforeStep()
      world.step()
      smoothing.afterStep()
      for (const remote of remoteCars.values()) remote.smoothing.afterStep()
      accumulator -= fixedDt
    }
    const physicsMs = performance.now() - physicsStart

    const localSnapshot = myId.value ? authoritativePlayers.value[myId.value] : undefined
    if (localSnapshot && localSnapshot.seq !== predictionLeadSeq) {
      const lag = stateLagSeconds(localSnapshot.ack, localSnapshot.ackAgeMs)
      if (lag !== null) predictionLead = lag - (performance.now() - localSnapshot.time) / 1000
      predictionLeadSeq = localSnapshot.seq
    }
    if (localSnapshot && localSnapshot.ack > lastReconciledAck) {
      const lag = stateLagSeconds(localSnapshot.ack, localSnapshot.ackAgeMs) ?? 0
      smoothing.beginCorrection()
      reconcile(chassis.body, localSnapshot, lag)
      smoothing.endCorrection()
      lastReconciledAck = localSnapshot.ack
    }

    for (const [id, remote] of remoteCars) {
      remote.smoothing.sample(accumulator / fixedDt, frameDt, remote.mesh.position, remote.mesh.quaternion)
      const steer = authoritativePlayers.value[id]?.steering ?? 0
      for (const wheelIndex of [0, 1]) remote.wheels[wheelIndex]?.quaternion.setFromAxisAngle(steeringAxis, steer)
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
