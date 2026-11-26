import RAPIER from "@dimforge/rapier3d-compat"
import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"
import { chassisAxes, rotateByQuat } from "../math.js"

export const { width: chassisWidth, height: chassisHeight, length: chassisLength } = VEHICLE_DIMENSIONS.chassis

/** Spawn slots per row. The ramp is 6 m wide (x from -3 to 3), so two cars fit side by side. */
const SLOTS_PER_ROW = 2
const SLOT_X = [-1.5, 1.5]
/** Each row is 3 m further down the ramp. The ramp drops ~0.55 m in height per metre of z. */
const ROW_Z_STEP = 3
const ROW_Y_STEP = ROW_Z_STEP * 0.554

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
    // Quaternion (x, y, z, w). Rapier normalizes it. Faces the car down the ramp.
    rotation: { x: 0, y: 1, z: 0.2, w: 0 },
  }
}

export default function initChassis(world: RAPIER.World, spawnIndex = 0) {
  const pose = spawnPose(spawnIndex)
  const chassisBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
    pose.translation.x,
    pose.translation.y,
    pose.translation.z,
  )
  chassisBodyDesc.setRotation(pose.rotation)
  const chassisBody = world.createRigidBody(chassisBodyDesc)

  const chassisColliderDesc = RAPIER.ColliderDesc.cuboid(
    chassisWidth / 2,
    chassisHeight / 2,
    chassisLength / 2,
  ).setDensity(2.0) // Increase density to give the soapbox momentum
  world.createCollider(chassisColliderDesc, chassisBody)

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
  body.setTranslation(pose.translation, true)
  body.setRotation(pose.rotation, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
}


/** Spawn pose rotation at unit length. Shape queries need a unit quaternion. Rapier normalizes it only for bodies. */
function unitRotation(q: { x: number; y: number; z: number; w: number }) {
  const length = Math.hypot(q.x, q.y, q.z, q.w)
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length }
}

/**
 * True when no car is on the spot of a spawn slot. Tests a chassis box at the slot pose against cars only: fixed
 * colliders (ramp, ground, walls, terrain) do not count. Uses the broad phase of the last `world.step()`.
 */
export function isSpawnClear(world: RAPIER.World, spawnIndex: number) {
  const pose = spawnPose(spawnIndex)
  const box = new RAPIER.Cuboid(chassisWidth / 2, chassisHeight / 2, chassisLength / 2)
  const hit = world.intersectionWithShape(
    pose.translation,
    unitRotation(pose.rotation),
    box,
    RAPIER.QueryFilterFlags.EXCLUDE_FIXED,
  )
  return hit === null
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

/** True when the car lies on its side or roof and has come to rest, so a flip may put it back on its wheels. */
export function isStuckUpsideDown(body: RAPIER.RigidBody) {
  const up = rotateByQuat(body.rotation(), { x: 0, y: 1, z: 0 })
  const v = body.linvel()
  const w = body.angvel()
  return (
    up.y < STUCK_MAX_UP && Math.hypot(v.x, v.y, v.z) < STUCK_MAX_SPEED && Math.hypot(w.x, w.y, w.z) < STUCK_MAX_SPIN
  )
}

/**
 * Puts the car upright, with the same heading, `FLIP_LIFT` higher, at rest. Call `resetDriveState` after it. Server and
 * client both run it, so the client prediction matches the server.
 */
export function flipUpright(body: RAPIER.RigidBody) {
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
  body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
  const p = body.translation()
  body.setTranslation({ x: p.x, y: p.y + FLIP_LIFT, z: p.z }, true)
  body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  body.setAngvel({ x: 0, y: 0, z: 0 }, true)
}
