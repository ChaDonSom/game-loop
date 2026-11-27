import RAPIER from "@dimforge/rapier3d-compat"
import { chassisColliderDesc, type VehicleState } from "@game-loop/shared"

/**
 * A remote car in the client physics world, so the local car can hit it during prediction (issue 13).
 *
 * Before, a remote car was only a mesh. The local car drove through it, the server car bounced, and `reconcile` then
 * pulled the local car to the server pose: a jump.
 *
 * The proxy is a dynamic body with the same chassis box and density as a real car. So in a hit, the solver trades
 * momentum with the right mass on both sides, as on the server, and the local car can push it. A kinematic body
 * cannot be pushed: the solver treats it as infinitely heavy, so the local car would bounce off it as off a wall.
 *
 * The proxy has no wheels and no gravity. Each step, `follow` steers its velocity toward the server state, moved
 * forward to the local car's time. A hit changes its velocity in the step; the steering then fades that change out
 * over ~`VELOCITY_TIME`, while new server states show where the server car really went.
 *
 * Plain math, no Three.js, so tests can run it with Rapier alone.
 */

/** YOUR CHOICE: velocity follows its target with this time constant, s. Shorter = stiffer, heavier-feeling proxy. */
const VELOCITY_TIME = 0.15
/** YOUR CHOICE: a position error closes at about 1/this per second, s. */
const POSITION_TIME = 0.25
/** Position errors below this are left alone, m. Extrapolation is never exact; chasing tiny errors adds jitter. */
const POSITION_DEAD_ZONE = 0.1
const ROTATION_TIME = 0.25
/** Rotation errors below this are left alone, rad (~1°). */
const ROTATION_DEAD_ZONE = 0.02
/** Past these errors, put the proxy at the target at once (first state, respawn, flip). Same rule as `reconcile`. */
const SNAP_DISTANCE = 4
const SNAP_DISTANCE_PER_SPEED = 0.1
const SNAP_ANGLE = 1.0
/** Do not extrapolate further than this, s. Same limit as `reconcile`. */
export const MAX_AHEAD_SECONDS = 0.3

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

/** a · b (Hamilton product). */
function multiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }
}

/** `rotation` turned by `angularVelocity` (world frame) for `seconds`. */
function advance(rotation: Quat, angularVelocity: Vec3, seconds: number): Quat {
  const rate = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z)
  if (rate < 1e-6) return rotation
  const half = (rate * seconds) / 2
  const s = Math.sin(half) / rate
  return multiply({ x: angularVelocity.x * s, y: angularVelocity.y * s, z: angularVelocity.z * s, w: Math.cos(half) }, rotation)
}

/** The rotation from `from` to `to`, in the world frame, as axis × angle (rad). */
function rotationBetween(from: Quat, to: Quat): Vec3 {
  // delta = to · inverse(from), so to = delta · from.
  let d = multiply(to, { x: -from.x, y: -from.y, z: -from.z, w: from.w })
  if (d.w < 0) d = { x: -d.x, y: -d.y, z: -d.z, w: -d.w } // the short way round
  const sinHalf = Math.hypot(d.x, d.y, d.z)
  if (sinHalf < 1e-9) return { x: 0, y: 0, z: 0 }
  const angle = 2 * Math.atan2(sinHalf, d.w)
  const k = angle / sinHalf
  return { x: d.x * k, y: d.y * k, z: d.z * k }
}

/** `v` shortened by `deadZone`, or zero inside it. */
function beyondDeadZone(v: Vec3, deadZone: number): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z)
  if (length <= deadZone) return { x: 0, y: 0, z: 0 }
  const k = (length - deadZone) / length
  return { x: v.x * k, y: v.y * k, z: v.z * k }
}

export default class RemoteCar {
  readonly body: RAPIER.RigidBody
  private placed = false

  constructor(world: RAPIER.World) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setGravityScale(0).setCanSleep(false))
    world.createCollider(chassisColliderDesc(), this.body)
  }

  /**
   * Call once before each `world.step()`.
   * @param server The latest server state of this car.
   * @param aheadSeconds How far the server state lags the local car's time at the end of this step.
   * @param dt The step length, s.
   * @returns true if the proxy jumped to the target (draw code should not glide over the jump).
   */
  follow(server: VehicleState, aheadSeconds: number, dt: number): boolean {
    const ahead = Math.min(Math.max(aheadSeconds, 0), MAX_AHEAD_SECONDS)
    const target = {
      x: server.position.x + server.velocity.x * ahead,
      y: server.position.y + server.velocity.y * ahead,
      z: server.position.z + server.velocity.z * ahead,
    }
    const targetRotation = advance(server.rotation, server.angularVelocity, ahead)

    const p = this.body.translation()
    const error = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z }
    const turn = rotationBetween(this.body.rotation(), targetRotation)
    const distance = Math.hypot(error.x, error.y, error.z)
    const angle = Math.hypot(turn.x, turn.y, turn.z)
    const speed = Math.hypot(server.velocity.x, server.velocity.y, server.velocity.z)

    if (!this.placed || distance > SNAP_DISTANCE + speed * SNAP_DISTANCE_PER_SPEED || angle > SNAP_ANGLE) {
      this.body.setTranslation(target, true)
      this.body.setRotation(targetRotation, true)
      this.body.setLinvel(server.velocity, true)
      this.body.setAngvel(server.angularVelocity, true)
      this.placed = true
      return true
    }

    // Fraction of the gap to the wanted velocity closed this step.
    const blend = 1 - Math.exp(-dt / VELOCITY_TIME)

    const e = beyondDeadZone(error, POSITION_DEAD_ZONE)
    const v = this.body.linvel()
    this.body.setLinvel(
      {
        x: v.x + (server.velocity.x + e.x / POSITION_TIME - v.x) * blend,
        y: v.y + (server.velocity.y + e.y / POSITION_TIME - v.y) * blend,
        z: v.z + (server.velocity.z + e.z / POSITION_TIME - v.z) * blend,
      },
      true,
    )

    const r = beyondDeadZone(turn, ROTATION_DEAD_ZONE)
    const w = this.body.angvel()
    const sw = server.angularVelocity
    this.body.setAngvel(
      {
        x: w.x + (sw.x + r.x / ROTATION_TIME - w.x) * blend,
        y: w.y + (sw.y + r.y / ROTATION_TIME - w.y) * blend,
        z: w.z + (sw.z + r.z / ROTATION_TIME - w.z) * blend,
      },
      true,
    )
    return false
  }

  remove(world: RAPIER.World) {
    world.removeRigidBody(this.body)
  }
}
