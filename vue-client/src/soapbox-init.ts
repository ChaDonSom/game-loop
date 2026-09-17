import * as THREE from "three"
import RAPIER from "@dimforge/rapier3d-compat"

async function init() {
  // ----------------------------------------------------
  // #region MARK: 1. INITIALIZE RAPIER WASM & PHYSICS WORLD
  // ----------------------------------------------------
  // Rapier requires loading the WASM binary before any physics calls.
  await RAPIER.init()

  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0)
  const world = new RAPIER.World(gravity)

  // ----------------------------------------------------
  // #region MARK: 2. THREE.JS SCENE SETUP
  // ----------------------------------------------------
  const container = document.getElementById("canvas-container")
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a24)

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 8, 18)
  // For following the car
  const cameraPosition = new THREE.Vector3()
  const cameraLookAt = new THREE.Vector3()
  const carForward = new THREE.Vector3()

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  container?.appendChild(renderer.domElement)

  // const controls = new OrbitControls(camera, renderer.domElement)
  // controls.enableDamping = true

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
  dirLight.position.set(10, 20, 10)
  dirLight.castShadow = true
  scene.add(dirLight)

  // Array to sync physics body positions with Three.js meshes
  const meshesToSync = []

  // ----------------------------------------------------
  // #region MARK: 3. GROUND & RAMP CREATION
  // ----------------------------------------------------
  // Create a tilted ramp using fixed body descriptors
  const rampWidth = 6,
    rampHeight = 0.2,
    rampLength = 22
  const rampBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, 2, -5)
    .setRotation({ x: 0.25, y: 0, z: 0, w: 0.968 })

  const rampBody = world.createRigidBody(rampBodyDesc)
  world.createCollider(RAPIER.ColliderDesc.cuboid(rampWidth / 2, rampHeight / 2, rampLength / 2), rampBody)

  const rampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(rampWidth, rampHeight, rampLength),
    new THREE.MeshStandardMaterial({ color: 0x444455 }),
  )
  rampMesh.position.copy(rampBody.translation())
  rampMesh.quaternion.copy(rampBody.rotation())
  rampMesh.receiveShadow = true
  scene.add(rampMesh)

  // Flat Ground Plane
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500), groundBody)

  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1000, 1, 1000),
    new THREE.MeshStandardMaterial({ color: 0x22222b }),
  )
  groundMesh.position.set(0, -0.5, 0)
  groundMesh.receiveShadow = true
  scene.add(groundMesh)

  // ----------------------------------------------------
  // #region MARK: 3.1 WALLS CREATION
  // Create walls around the ground plane
  // ---------------------------------------------------

  const wallHeight = 4,
    wallThickness = 1,
    wallLength = 1000

  const createWall = (x: number, y: number, z: number, rotY = 0) => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0), // Y axis
      rotY, // Rotation around the Y axis in radians
    )

    const wallBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setRotation(q)

    const wallBody = world.createRigidBody(wallBodyDesc)
    world.createCollider(RAPIER.ColliderDesc.cuboid(wallLength / 2, wallHeight / 2, wallThickness / 2), wallBody)

    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallLength, wallHeight, wallThickness),
      new THREE.MeshStandardMaterial({ color: 0x444455 }),
    )
    wallMesh.position.copy(wallBody.translation())
    wallMesh.quaternion.copy(wallBody.rotation())
    wallMesh.receiveShadow = true
    scene.add(wallMesh)
  }

  // Create four walls around the ground plane
  const degToRad = (deg: number) => (deg * Math.PI) / 180
  createWall(0, wallHeight / 2, -500) // Back wall
  createWall(0, wallHeight / 2, 500) // Front wall
  createWall(-500, wallHeight / 2, 0, degToRad(90)) // Left wall
  createWall(500, wallHeight / 2, 0, degToRad(90)) // Right wall

  // ----------------------------------------------------
  // #region MARK: 4. CHASSIS CREATION
  // ----------------------------------------------------
  const chassisWidth = 1.2,
    chassisHeight = 0.4,
    chassisLength = 2.4

  // Dynamic rigid body positioned at the top of the ramp
  const chassisBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 7, -12)
    .setRotation({ x: 0, y: 1, z: 0.2, w: 0 }) // Quarternions: an imaginary vector, x,y,z, and the real component w
  // which sets how far the rotation is around the axis defined by the imaginary vector (x, y, z), in radians
  const chassisBody = world.createRigidBody(chassisBodyDesc)

  const chassisColliderDesc = RAPIER.ColliderDesc.cuboid(
    chassisWidth / 2,
    chassisHeight / 2,
    chassisLength / 2,
  ).setDensity(2.0) // Increase density to give the soapbox momentum
  world.createCollider(chassisColliderDesc, chassisBody)

  const chassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(chassisWidth, chassisHeight, chassisLength),
    new THREE.MeshStandardMaterial({ color: 0xd9381e }),
  )
  chassisMesh.castShadow = true
  scene.add(chassisMesh)
  meshesToSync.push({ mesh: chassisMesh, body: chassisBody })

  // ----------------------------------------------------
  // #region MARK: 5. VEHICLE CONTROLLER & WHEELS
  // ----------------------------------------------------
  // AUDITED API: world.createVehicleController is the factory method for DynamicRayCastVehicleController
  const vehicle = world.createVehicleController(chassisBody)

  const wheelRadius = 0.3
  const wheelWidth = 0.15
  const suspensionRestLength = 0.3

  // Relative attachment points for 4 wheels on the chassis [X, Y, Z]
  const wheelOffsets = [
    new RAPIER.Vector3(chassisWidth / 2, -chassisHeight / 6, -chassisLength / 3), // Front-Right
    new RAPIER.Vector3(-chassisWidth / 2, -chassisHeight / 6, -chassisLength / 3), // Front-Left
    new RAPIER.Vector3(chassisWidth / 2, -chassisHeight / 6, chassisLength / 3), // Rear-Right
    new RAPIER.Vector3(-chassisWidth / 2, -chassisHeight / 6, chassisLength / 3), // Rear-Left
  ]

  const wheelMeshes: THREE.Mesh[] = []
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24)
  wheelGeo.rotateZ(Math.PI / 2)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 })

  wheelOffsets.forEach((offset, i) => {
    // Add wheel to raycast vehicle controller
    // Arguments: connectionPoint, direction (down), axle (X-axis), suspensionRestLength, radius
    vehicle.addWheel(
      offset,
      new RAPIER.Vector3(0, -1, 0),
      new RAPIER.Vector3(1, 0, 0),
      suspensionRestLength,
      wheelRadius,
    ) // i's 0 and 1 are the front wheels for steering

    // Configure wheel suspension & friction properties
    vehicle.setWheelSuspensionStiffness(i, 40.0)
    vehicle.setWheelFrictionSlip(i, 5.0) // Side slip traction

    const wMesh = new THREE.Mesh(wheelGeo, wheelMat)
    wMesh.castShadow = true
    scene.add(wMesh)
    wheelMeshes.push(wMesh) // meshes i 0 and 1 are the front wheels for steering
  })

  // #region MARK: 5.1 CONTROLS SETUP
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

  // #region MARK 5.2 GAMEPAD CONTROLS
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

  // #region MARK: 5.3 CONTROLS DURING GAMEPLAY
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
  // #region MARK: 6. ANIMATION LOOP
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
    const { steering, engineForce } = handleSteeringAndDrive(dt, chassisBody)

    // Step physics forward (1/60s step)
    world.step()

    // AUDITED API: Updates raycast positions, suspension compression, and chassis forces
    vehicle.updateVehicle(1 / 60)

    // Update chassis visual position
    const cPos = chassisBody.translation()
    const cRot = chassisBody.rotation()
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

    camera.lookAt(cameraLookAt)

    // AUDITED API: Synchronize wheel meshes by converting chassis-relative positions to world coordinates
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
