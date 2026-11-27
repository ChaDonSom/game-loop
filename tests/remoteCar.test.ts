// Issue 13: remote cars in the client world. The local car must hit a proxy, and the hit must share momentum.
import { test } from "node:test"
import assert from "node:assert/strict"
import RAPIER from "@dimforge/rapier3d-compat"
import { chassisColliderDesc, initRapier, type VehicleState } from "@game-loop/shared"
import RemoteCar from "../vue-client/src/physics/remoteCar.ts"

const dt = 1 / 60

function state(z: number, vz: number): VehicleState {
  return {
    id: "remote",
    ack: 0,
    ackAgeMs: 0,
    position: { x: 0, y: 2, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: vz },
    angularVelocity: { x: 0, y: 0, z: 0 },
    steering: 0,
  }
}

/** A stand-in for the local car: a chassis body with no gravity and no wheels, so only the hit acts on it. */
function localCar(world: RAPIER.World, z: number, vz: number) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, z).setLinvel(0, 0, vz).setGravityScale(0),
  )
  world.createCollider(chassisColliderDesc(), body)
  return body
}

test("first follow puts the proxy at the server pose, moved ahead", async () => {
  const { world } = await initRapier()
  const car = new RemoteCar(world)
  assert.equal(car.follow(state(0, 10), 0.1, dt), true)
  assert.ok(Math.abs(car.body.translation().z - 1) < 1e-6)
})

test("with no hit, the proxy tracks a moving server car", async () => {
  const { world } = await initRapier()
  const car = new RemoteCar(world)
  const lead = 0.1
  for (let i = 0; i <= 120; i++) {
    const serverZ = 10 * i * dt
    assert.equal(car.follow(state(serverZ, 10), lead, dt), i === 0)
    world.step()
  }
  // Target at the end: server z after 120 steps plus 10 m/s × lead, plus one step (the body moved once more).
  const target = 10 * 120 * dt + 10 * lead + 10 * dt
  assert.ok(Math.abs(car.body.translation().z - target) < 0.15, `z ${car.body.translation().z} vs ${target}`)
})

test("a hit pushes the proxy: the two cars share the momentum", async () => {
  const { world } = await initRapier()
  const car = new RemoteCar(world)
  // Remote car parked at z = 0. The local car comes from z = -4 at +10 m/s.
  car.follow(state(0, 0), 0, dt)
  const local = localCar(world, -4, 10)

  let proxySpeedAfterHit = 0
  let localSpeedAfterHit = 10
  for (let i = 0; i < 30; i++) {
    car.follow(state(0, 0), 0, dt)
    world.step()
    if (local.linvel().z < 9 && proxySpeedAfterHit === 0) {
      proxySpeedAfterHit = car.body.linvel().z
      localSpeedAfterHit = local.linvel().z
    }
  }
  // Same mass, no bounce: each car leaves the hit near 5 m/s. A kinematic proxy would stop the local car dead.
  assert.ok(proxySpeedAfterHit > 3, `proxy ${proxySpeedAfterHit}`)
  assert.ok(localSpeedAfterHit > 3 && localSpeedAfterHit < 7, `local ${localSpeedAfterHit}`)
})

test("remove takes the proxy out of the world", async () => {
  const { world } = await initRapier()
  const car = new RemoteCar(world)
  car.remove(world)
  assert.equal(world.bodies.len(), 0)
})
