// Plan C: frontAxleSlip sign and size, and that a positive target steers the car right.
import { test } from "node:test"
import assert from "node:assert/strict"
import RAPIER from "@dimforge/rapier3d-compat"
import {
  frontAxleSlip,
  handleSteeringAndDrive,
  initChassis,
  initGround,
  initRapier,
  initWheels,
} from "@game-loop/shared"
import { chassisAxes } from "../shared/dist/math.js"

const { world } = await initRapier()

function bodyWith(linvel: RAPIER.Vector, angvel = { x: 0, y: 0, z: 0 }) {
  // Identity rotation: the nose (local −z) faces world −Z, and the car's right (local +x) is world +X.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
  body.setLinvel(linvel, false)
  body.setAngvel(angvel, false)
  return body
}

test("straight ahead: angle 0", () => {
  const slip = frontAxleSlip(bodyWith({ x: 0, y: 0, z: -10 }))
  assert.equal(slip.angle, 0)
  assert.equal(slip.rearAngle, 0)
  assert.ok(Math.abs(slip.forwardSpeed - 10) < 1e-9)
})

test("whole car moving to its right: positive angle, same at both axles", () => {
  const slip = frontAxleSlip(bodyWith({ x: 2, y: 0, z: -10 }))
  assert.ok(Math.abs(slip.angle - Math.atan2(2, 10)) < 1e-9)
  assert.ok(Math.abs(slip.rearAngle - Math.atan2(2, 10)) < 1e-9)
})

test("yawing left: front axle goes left (negative), rear goes right (positive)", () => {
  const slip = frontAxleSlip(bodyWith({ x: 0, y: 0, z: -10 }, { x: 0, y: 1, z: 0 }))
  assert.ok(slip.angle < 0, `front ${slip.angle}`)
  assert.ok(slip.rearAngle > 0, `rear ${slip.rearAngle}`)
})

test("reverse and standstill: angle 0", () => {
  assert.equal(frontAxleSlip(bodyWith({ x: 1, y: 0, z: 5 })).angle, 0)
  assert.equal(frontAxleSlip(bodyWith({ x: 0, y: 0, z: 0 })).angle, 0)
})

test("chassisAxes forward matches the old forwardSpeed formula", () => {
  for (let i = 0; i < 20; i++) {
    const raw = { x: Math.sin(i), y: Math.cos(i * 1.7), z: Math.sin(i * 0.3), w: Math.cos(i * 2.1) }
    const n = Math.hypot(raw.x, raw.y, raw.z, raw.w)
    const q = { x: raw.x / n, y: raw.y / n, z: raw.z / n, w: raw.w / n }
    const old = {
      x: -2 * (q.x * q.z + q.w * q.y),
      y: -2 * (q.y * q.z - q.w * q.x),
      z: -(1 - 2 * (q.x * q.x + q.y * q.y)),
    }
    const now = chassisAxes(q).forward
    assert.ok(Math.hypot(now.x - old.x, now.y - old.y, now.z - old.z) < 1e-12)
  }
})

test("sign chain: pad.steer > 0 turns the car right, so a positive target means 'steer right'", () => {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  initGround(w)
  const chassis = initChassis(w)
  chassis.body.setTranslation({ x: 0, y: 1, z: 0 }, true)
  chassis.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  const vehicle = w.createVehicleController(chassis.body)
  initWheels(chassis, vehicle)
  const pad = { connected: true, steer: 0.5, throttle: 0.4, brake: 0, reverse: false }
  for (let i = 0; i < 120; i++) {
    handleSteeringAndDrive(1 / 60, chassis.body, pad, {}, vehicle)
    vehicle.updateVehicle(1 / 60)
    w.step()
  }
  // Started facing −Z with its right at +X. Turning right moves it toward +X.
  const p = chassis.body.translation()
  assert.ok(p.z < -0.5, `moved forward: z ${p.z}`)
  assert.ok(p.x > 0.1, `moved right: x ${p.x}`)
})
