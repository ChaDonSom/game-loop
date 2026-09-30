import * as THREE from "three"
import RAPIER from "@dimforge/rapier3d-compat"
import { initRapier, ramp as createRamp, initGround, initWalls, initChassis, initWheels } from "@game-loop/shared"
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

async function init() {
  const { world } = await initRapier()

  // ----------------------------------------------------
  // #region 2. THREE.JS SCENE SETUP
  // ----------------------------------------------------
  const container = document.getElementById("canvas-container")
  const scene = initScene()
  const camera = initCamera()
  // For following the car
  const cameraPosition = new THREE.Vector3()
  const cameraLookAt = new THREE.Vector3()
  const carForward = new THREE.Vector3()

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

  // #region 5.1 CONTROLS SETUP
  const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    KeyA: false,
    KeyD: false,
    KeyW: false,
    KeyS: false,
  }
  window.addEventListener("keydown", (e) => {
    const code = e.code as keyof typeof keys
    if (code in keys) keys[code] = true
  })
  window.addEventListener("keyup", (e) => {
    const code = e.code as keyof typeof keys
    if (code in keys) keys[code] = false
  })

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
  }

  // #region 5.2 GAMEPAD CONTROLS
  function getGamepadState() {
    const gp = navigator.getGamepads ? navigator.getGamepads()[1] : null
    if (!gp) {
      return { steer: 0, throttle: 0, brake: 0, connected: false }
    }
    const steer = gp.axes[0] || 0
    const throttle = gp.buttons[7] ? (gp.buttons[7].value ?? 0) : 0
    const brake = gp.buttons[6] ? (gp.buttons[6].value ?? 0) : 0
    return { steer, throttle, brake, connected: true }
  }

  // #region 5.3 CONTROLS DURING GAMEPLAY
  function handleSteeringAndDrive(dt: number, body: RAPIER.RigidBody) {
    const pad = getGamepadState()
    const connected = pad.connected
    const steerInput = clamp(pad.steer, -1, 1)
    const throttleInput = clamp(pad.throttle, 0, 1)
    const brakeInput = clamp(pad.brake, 0, 1)

    if (!connected) {
      // Arrow keys will need the velocity of the body, to determine how quickly to adjust the steering
      const velocity = body.linvel() // Get the current velocity of the body
      // Get speed from velocity, velocity is just { x, y, z }
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z) // Calculate the speed of the body
      const steeringAdjustment = 0.07 / (speed + 1) // Adjust steering less based on higher speed
      if (keys.ArrowLeft || keys.KeyA) steering = Math.min(steering + steeringAdjustment, maxSteering)
      if (keys.ArrowRight || keys.KeyD) steering = Math.max(steering - steeringAdjustment, minSteering)
      if (!keys.ArrowLeft && !keys.KeyA && !keys.ArrowRight && !keys.KeyD) {
        // Gradually reduce steering to zero when no left/right keys are pressed
        steering *= 0.9 // Gradually reduce steering towards zero
      }

      // Throttle/brake rear wheels (Index 2 and 3)
      if (keys.ArrowUp || keys.KeyW) engineForce = Math.min(engineForce + 0.1, maxEngineForce)
      if (keys.ArrowDown || keys.KeyS) engineForce = Math.max(engineForce - 0.1, minEngineForce)
      if (!keys.ArrowUp && !keys.KeyW && !keys.ArrowDown && !keys.KeyS) {
        // Gradually reduce engine force to zero when no throttle or brake keys are pressed
        engineForce *= 0.9 // Gradually reduce engine force towards zero
      }
    } else {
      // Gamepad controls
      steering = steerInput * maxSteering * -1

      // Throttle/brake rear wheels (Index 2 and 3)
      engineForce = throttleInput * maxEngineForce
      if (brakeInput > 0) engineForce = Math.max(engineForce - brakeInput * maxEngineForce, minEngineForce)
    }

    vehicle.setWheelEngineForce(2, engineForce)
    vehicle.setWheelEngineForce(3, engineForce)

    vehicle.setWheelSteering(0, steering)
    vehicle.setWheelSteering(1, steering)

    return { steering, engineForce }
  }

  // Helper math variables for wheel world transforms
  const tempWheelPos = new THREE.Vector3()
  const tempChassisQuat = new THREE.Quaternion()

  // ----------------------------------------------------
  // #region 6. ANIMATION LOOP
  // ----------------------------------------------------
  const clock = new THREE.Clock()
  let lastTime = 0
  let engineForce = 0
  const maxEngineForce = 25
  const minEngineForce = -25
  let steering = 0
  const maxSteering = 0.45
  const minSteering = -0.45
  function animate() {
    requestAnimationFrame(animate)
    const dt = Math.min(clock.getDelta(), 0.032)
    lastTime = performance.now()

    // Steer front wheels (Index 0 and 1)
    const { steering, engineForce } = handleSteeringAndDrive(dt, chassis.body)

    // Step physics forward (1/60s step)
    world.step()

    // AUDITED API: Updates raycast positions, suspension compression, and chassis forces
    vehicle.updateVehicle(1 / 60)

    // Update chassis visual position
    const cPos = chassis.body.translation()
    const cRot = chassis.body.rotation()
    chassisMesh.position.set(cPos.x, cPos.y, cPos.z)
    chassisMesh.quaternion.set(cRot.x, cRot.y, cRot.z, cRot.w)

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

    // #region Wheel meshes to world coordinates
    // Synchronize wheel meshes by converting chassis-relative positions to world coordinates
    tempChassisQuat.set(cRot.x, cRot.y, cRot.z, cRot.w)
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
    // controls.update()
    renderer.render(scene, camera)
  }

  animate()

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

init()
