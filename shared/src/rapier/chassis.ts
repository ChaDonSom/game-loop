import RAPIER from "@dimforge/rapier3d-compat"
import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"
import { chassisAxes } from "../math.js"
import { resetDriveState } from "../controls/handleSteeringAndDrive.js"

export const { width: chassisWidth, height: chassisHeight, length: chassisLength } = VEHICLE_DIMENSIONS.chassis

/** Spawn slots per row. The ramp is 6 m wide (x from -3 to 3), so two cars fit side by side. */
const SLOTS_PER_ROW = 2
const SLOT_X = [-1.5, 1.5]
/** Each row is 3 m further down the ramp. The ramp drops ~0.55 m in height per metre of z. */
const ROW_Z_STEP = 3
const ROW_Y_STEP = ROW_Z_STEP * 0.554

const SPAWN_ROTATION = { x: 0, y: 1 / Math.hypot(1, 0.2), z: 0.2 / Math.hypot(1, 0.2), w: 0 }

/**
 * Start pose for a spawn slot. Server and client both use it, so a client starts its car where the server does.
 * Every slot is on the ramp.
 */
export function spawnPose(spawnIndex: number) {
  const row = Math.floor(spawnIndex / SLOTS_PER_ROW)
  return {
    translation: {
      x: SLOT_X[spawnIndex % SLOTS_PER_ROW] ?? 0,
      y: 7 - row * ROW_Y_STEP,
      z: -12 + row * ROW_Z_STEP,
    },
    // Faces the car down the ramp: (0, 1, 0.2, 0) at unit length. Shape queries need a unit quaternion.
    rotation: SPAWN_ROTATION,
  }
}

/**
 * The chassis box. One source for every car body: the server cars, the local car, and the client's remote-car proxies
 * (`vue-client/src/physics/remoteCar.ts`). Same size and density, so a hit trades the same momentum on both sides.
 */
export function chassisColliderDesc() {
  // Density 2 gives the soapbox momentum.
  return RAPIER.ColliderDesc.cuboid(chassisWidth / 2, chassisHeight / 2, chassisLength / 2).setDensity(2.0)
}

export default function initChassis(world: RAPIER.World, spawnIndex = 0) {
  const pose = spawnPose(spawnIndex)
  const chassisBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
    pose.translation.x,
    pose.translation.y,
    pose.translation.z,
  )
  chassisBodyDesc.setRotation(pose.rotation)
  // No sleep: while a body sleeps, the wheel controller still adds suspension impulses to its velocity. The car stays
  // still but reports a growing false velocity (~2.8 m/s up at rest), which `reconcile` and remote-car proxies then
  // extrapolate. It also launches the car when it wakes.
  chassisBodyDesc.setCanSleep(false)
  const chassisBody = world.createRigidBody(chassisBodyDesc)

  world.createCollider(chassisColliderDesc(), chassisBody)

  return {
    body: chassisBody,
    width: chassisWidth,
    height: chassisHeight,
    length: chassisLength,
  }
}

/** Moves a chassis body back to a spawn slot and stops it. */
export function resetChassisToSpawn(body: RAPIER.RigidBody, spawnIndex: number) {
  const pose = spawnPose(spawnIndex)
  placeAtRest(body, pose.translation, pose.rotation)
}

/** Moves a body to a pose and stops it. */
function placeAtRest(body: RAPIER.RigidBody, translation: RAPIER.Vector, rotation: RAPIER.Rotation) {
  body.setTranslation(translation, true)
  body.setRotation(rotation, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
}


/**
 * True when no car is on the spot of a spawn slot. Tests a chassis box at the slot pose against cars only: fixed
 * colliders (ramp, ground, walls, terrain) do not count. Uses the broad phase of the last `world.step()`.
 */
export function isSpawnClear(world: RAPIER.World, spawnIndex: number) {
  const pose = spawnPose(spawnIndex)
  return isChassisBoxClear(world, pose.translation, pose.rotation, RAPIER.QueryFilterFlags.EXCLUDE_FIXED)
}

/** True when a chassis box at this pose touches no collider that the filter keeps. */
function isChassisBoxClear(
  world: RAPIER.World,
  translation: RAPIER.Vector,
  rotation: RAPIER.Rotation,
  flags?: RAPIER.QueryFilterFlags,
  excludeBody?: RAPIER.RigidBody,
) {
  const box = new RAPIER.Cuboid(chassisWidth / 2, chassisHeight / 2, chassisLength / 2)
  return world.intersectionWithShape(translation, rotation, box, flags, undefined, undefined, excludeBody) === null
}

/**
 * YOUR CHOICE: the car counts as stuck when the world-up part of its up axis is below this. 1 = upright, 0 = on its
 * side, −1 = on its roof. Look at the tilt a car can still drive out of on the banked oval (`terrain/layout.ts`).
 */
const STUCK_MAX_UP = 0.3
/**
 * YOUR CHOICE: stuck only below this speed, m/s (1 m/s = 2.237 mph). Too high, and the button shows while the car
 * still slides on its roof.
 */
const STUCK_MAX_SPEED = 0.9
/** YOUR CHOICE: stuck only below this spin, rad/s. Too high, and the button shows mid-tumble. */
const STUCK_MAX_SPIN = 1
/**
 * YOUR CHOICE: how far the flip lifts the car, m. Look at `chassisHeight` here and the wheel radius and rest length in
 * `wheels.ts`. Too low, and the wheels start inside the ground. Too high, and the car drops hard.
 */
const FLIP_LIFT = 1
/** If the lifted spot is blocked (under the ramp, at a wall), try this many more lifts, each `FLIP_LIFT` higher. */
const FLIP_EXTRA_TRIES = 2

/** True when the car lies on its side or roof and has come to rest, so a flip may put it back on its wheels. */
export function isStuckUpsideDown(body: RAPIER.RigidBody) {
  // World-up part of the car's up axis, from the quaternion. The client runs this each step, so it reads the
  // velocities only when the tilt test passes.
  const q = body.rotation()
  if (1 - 2 * (q.x * q.x + q.z * q.z) >= STUCK_MAX_UP) return false
  const v = body.linvel()
  const w = body.angvel()
  return Math.hypot(v.x, v.y, v.z) < STUCK_MAX_SPEED && Math.hypot(w.x, w.y, w.z) < STUCK_MAX_SPIN
}

/**
 * The flip rule, for server and client alike: if the car is stuck, put it upright and reset its drive state. Returns
 * true if it flipped. The client predicts with the same function, so the two cannot drift apart.
 */
export function tryFlip(world: RAPIER.World, body: RAPIER.RigidBody, vehicle: RAPIER.DynamicRayCastVehicleController) {
  if (!isStuckUpsideDown(body) || !flipUpright(world, body)) return false
  resetDriveState(vehicle)
  return true
}

/**
 * Puts the car upright, with the same heading, `FLIP_LIFT` higher, at rest. If that spot is blocked, tries higher. If
 * every spot is blocked, does nothing and returns false. Use `tryFlip`, which also checks the car is stuck. (The
 * client's remote cars are proxies that follow the server with some error, so near another car the client and server
 * can still pick different heights. `reconcile` then corrects it.)
 */
export function flipUpright(world: RAPIER.World, body: RAPIER.RigidBody) {
  const { forward, right } = chassisAxes(body.rotation())
  // Heading on the ground plane. If the nose points almost straight up or down, the right axis still lies flat.
  let fx = forward.x
  let fz = forward.z
  if (Math.hypot(fx, fz) < 0.2) {
    fx = right.z
    fz = -right.x
  }
  // Upright yaw θ has forward = (−sin θ, 0, −cos θ).
  const yaw = Math.atan2(-fx, -fz)
  const rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
  const p = body.translation()
  for (let tries = 1; tries <= 1 + FLIP_EXTRA_TRIES; tries++) {
    const translation = { x: p.x, y: p.y + FLIP_LIFT * tries, z: p.z }
    if (!isChassisBoxClear(world, translation, rotation, undefined, body)) continue
    placeAtRest(body, translation, rotation)
    return true
  }
  return false
}
