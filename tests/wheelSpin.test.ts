// Issue 20: the drawn wheels roll the same way the car moves.
import { test } from "node:test"
import assert from "node:assert/strict"
// three lives in the client workspace only. This is the file its "import" export points to, so it is the same module
// instance that wheels.ts uses.
import * as THREE from "../vue-client/node_modules/three/build/three.module.js"
import {
  applySurfaceGrip,
  buildTerrainPhysics,
  chassisAxes,
  DEFAULT_WORLD,
  dot,
  handleSteeringAndDrive,
  initChassis,
  initGround,
  initRapier,
  initWheels,
  VEHICLE_DIMENSIONS,
} from "@game-loop/shared"
import { rollRate, setWheelLocalRotation } from "../vue-client/src/three/wheels.ts"

const radius = VEHICLE_DIMENSIONS.wheel.radius
const dt = 1 / 60

test("Rapier wheelRotation rises as the car rolls forward", async () => {
  // Same grip and step order as the client loop, on flat ground only. The spawn slot drops the car tilted onto the
  // terrain, where it can ride on two wheels. Measured in the car's own frame, so its heading does not matter.
  const { world } = await initRapier()
  initGround(world)
  const terrain = buildTerrainPhysics(world, [])
  const chassis = initChassis(world)
  chassis.body.setTranslation({ x: 0, y: 1, z: 0 }, true)
  chassis.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  const vehicle = world.createVehicleController(chassis.body)
  initWheels(chassis, vehicle)
  const pad = { connected: false } as Parameters<typeof handleSteeringAndDrive>[2]
  const keys = { KeyW: true } as Parameters<typeof handleSteeringAndDrive>[3]

  let checked = 0
  let previous = vehicle.wheelRotation(0)
  for (let i = 0; i < 300; i++) {
    handleSteeringAndDrive(dt, chassis.body, pad, keys, vehicle)
    applySurfaceGrip(vehicle, terrain, DEFAULT_WORLD.surfaceGrip)
    vehicle.updateVehicle(dt)
    world.step()
    const rotation = vehicle.wheelRotation(0)
    const speed = dot(chassisAxes(chassis.body.rotation()).forward, chassis.body.linvel())
    if (rotation !== null && previous !== null && vehicle.wheelIsInContact(0) && speed > 2) {
      const rate = (rotation - previous) / dt
      assert.ok(rate > 0, `step ${i}: forward ${speed.toFixed(2)} m/s, wheel ${rate.toFixed(2)} rad/s`)
      checked++
    }
    previous = rotation
  }
  assert.ok(checked > 10, `only ${checked} rolling steps checked`)
})

test("a rising spin rolls the drawn wheel forward: its top moves toward −z", () => {
  const top = new THREE.Vector3(0, 1, 0).applyQuaternion(setWheelLocalRotation(new THREE.Quaternion(), 0, 0.3))
  assert.ok(top.z < -0.2, `top z ${top.z}`)
})

test("remote roll rate has Rapier's sign: positive forward, negative in reverse", () => {
  const upright = { x: 0, y: 0, z: 0, w: 1 }
  assert.ok(Math.abs(rollRate({ x: 0, y: 0, z: -6 }, upright, radius) - 6 / radius) < 1e-9)
  assert.ok(rollRate({ x: 0, y: 0, z: 3 }, upright, radius) < 0)
  // Turned 180° about y: world +Z is now forward.
  const turned = { x: 0, y: 1, z: 0, w: 0 }
  assert.ok(rollRate({ x: 0, y: 0, z: 6 }, turned, radius) > 0)
})

test("rays sit out across the tire by rayOutward; tires are drawn at the hubs", async () => {
  const { world } = await initRapier()
  const chassis = initChassis(world)
  const vehicle = world.createVehicleController(chassis.body)
  const config = initWheels(chassis, vehicle)
  const { width, rayOutward } = VEHICLE_DIMENSIONS.wheel
  for (const [i, hub] of config.hubOffset.entries()) {
    assert.equal(Math.abs(hub.x), chassis.width / 2)
    const ray = vehicle.wheelChassisConnectionPointCs(i)!
    // Same side as the hub, further out by the fraction of half the tire width.
    assert.ok(Math.abs(ray.x - (hub.x + Math.sign(hub.x) * rayOutward * (width / 2))) < 1e-6, `wheel ${i}: ray x ${ray.x}`)
    assert.ok(Math.abs(ray.z - hub.z) < 1e-6)
  }
})
