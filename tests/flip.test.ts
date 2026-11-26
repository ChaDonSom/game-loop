// Plan F2, F3: when a car may flip, and what the flip does.
import { test } from "node:test"
import assert from "node:assert/strict"
import RAPIER from "@dimforge/rapier3d-compat"
import {
  flipUpright,
  initChassis,
  initGround,
  initRapier,
  initWheels,
  isStuckUpsideDown,
  resetDriveState,
} from "@game-loop/shared"
import { chassisAxes, rotateByQuat } from "../shared/dist/math.js"

/** Yaw `yaw` about world up, then roll `roll` about the car's forward (local z) axis. */
function pose(yaw: number, roll: number) {
  const qy = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
  const s = Math.sin(roll / 2)
  const c = Math.cos(roll / 2)
  // qy * qroll, with qroll = (0, 0, s, c).
  return { x: qy.y * s, y: qy.y * c, z: qy.w * s, w: qy.w * c }
}

async function carOnGround(yaw: number, roll: number) {
  const { world } = await initRapier()
  initGround(world)
  const chassis = initChassis(world)
  const vehicle = world.createVehicleController(chassis.body)
  initWheels(chassis, vehicle)
  chassis.body.setTranslation({ x: 0, y: 1, z: 0 }, true)
  chassis.body.setRotation(pose(yaw, roll), true)
  const step = () => {
    vehicle.updateVehicle(1 / 60)
    world.step()
  }
  for (let i = 0; i < 180; i++) step()
  return { world, body: chassis.body, vehicle, step }
}

const upY = (body: RAPIER.RigidBody) => rotateByQuat(body.rotation(), { x: 0, y: 1, z: 0 }).y
const heading = (body: RAPIER.RigidBody) => {
  const f = chassisAxes(body.rotation()).forward
  return Math.atan2(-f.x, -f.z)
}

test("on its roof at rest: stuck. Flip: upright, same heading, rests on its wheels", async () => {
  const { body, vehicle, step } = await carOnGround(0.7, Math.PI)
  assert.ok(upY(body) < -0.9, `up.y ${upY(body)}`)
  assert.ok(isStuckUpsideDown(body))
  const before = heading(body)

  flipUpright(body)
  resetDriveState(vehicle)
  assert.ok(upY(body) > 0.999)
  assert.ok(Math.abs(heading(body) - before) < 1e-6)

  for (let i = 0; i < 120; i++) step()
  assert.ok(upY(body) > 0.95, `up.y after 2 s: ${upY(body)}`)
  assert.equal(isStuckUpsideDown(body), false)
})

test("on its side at rest: stuck", async () => {
  // Not settled by steps: this box is 1.2 m wide and 0.4 m tall, so on its side it tips onto its roof or wheels.
  const { world } = await initRapier()
  const { body } = initChassis(world)
  body.setRotation(pose(0, Math.PI / 2), true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  assert.ok(Math.abs(upY(body)) < 1e-6, `up.y ${upY(body)}`)
  assert.ok(isStuckUpsideDown(body))
})

test("upright at rest: not stuck", async () => {
  const { body } = await carOnGround(0, 0)
  assert.equal(isStuckUpsideDown(body), false)
})

test("on its roof but sliding: not stuck", async () => {
  const { body } = await carOnGround(0, Math.PI)
  body.setLinvel({ x: 5, y: 0, z: 0 }, true)
  assert.equal(isStuckUpsideDown(body), false)
})
