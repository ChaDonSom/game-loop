import type RAPIER from "@dimforge/rapier3d-compat"
import * as THREE from "three"
import type { VehicleState } from "@game-loop/shared"

/**
 * Pulls the locally predicted car toward the server state.
 *
 * The server state is old: it shows the car about `lagSeconds` (one round trip) in the past. The old code blended
 * toward that old state, so every packet pulled the car back and teleported it in height against the suspension. The
 * camera showed each pull as an up-down jolt.
 *
 * This version:
 * - moves the server position forward by `velocity * lagSeconds`, so it compares like with like;
 * - ignores small errors (they are normal prediction error, and correcting them makes jitter);
 * - corrects height only past a dead zone, so it does not fight the suspension;
 * - snaps fully when the error is large (crash, flip, respawn), so the car never drags toward a far pose.
 */

/** Errors below this need no correction, in metres. */
const POSITION_DEAD_ZONE = 0.25
/** Height errors below this need no correction, in metres. Suspension travel alone is ~0.3 m. */
const HEIGHT_DEAD_ZONE = 0.35
/** Fraction of the remaining error to remove per server state. */
const POSITION_BLEND = 0.1
const VELOCITY_BLEND = 0.1
/** Rotation errors below this need no correction, in radians (~3°). */
const ROTATION_DEAD_ZONE = 0.05
const ROTATION_BLEND = 0.05
/** Past these errors, copy the server state at once. */
const SNAP_DISTANCE = 4
const SNAP_ANGLE = 1.0
/** Do not extrapolate further than this. A longer lag means a stall, and the extrapolation would be a guess. */
const MAX_LAG_SECONDS = 0.3

const serverRotation = new THREE.Quaternion()
const clientRotation = new THREE.Quaternion()

/** Moves `value` toward 0 by `deadZone`. Returns 0 inside the dead zone. */
function beyondDeadZone(value: number, deadZone: number) {
  if (Math.abs(value) <= deadZone) return 0
  return value - Math.sign(value) * deadZone
}

export default function reconcile(body: RAPIER.RigidBody, server: VehicleState, lagSeconds: number) {
  const lag = Math.min(Math.max(lagSeconds, 0), MAX_LAG_SECONDS)
  const position = body.translation()
  const velocity = body.linvel()
  const rotation = body.rotation()

  // Where the server car is now, if it kept its velocity.
  const targetX = server.position.x + server.velocity.x * lag
  const targetY = server.position.y + server.velocity.y * lag
  const targetZ = server.position.z + server.velocity.z * lag

  const dx = targetX - position.x
  const dy = targetY - position.y
  const dz = targetZ - position.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

  serverRotation.set(server.rotation.x, server.rotation.y, server.rotation.z, server.rotation.w)
  clientRotation.set(rotation.x, rotation.y, rotation.z, rotation.w)
  const angle = clientRotation.angleTo(serverRotation)

  if (distance > SNAP_DISTANCE || angle > SNAP_ANGLE) {
    body.setTranslation({ x: targetX, y: targetY, z: targetZ }, true)
    body.setRotation(server.rotation, true)
    body.setLinvel(server.velocity, true)
    return
  }

  const horizontal = Math.sqrt(dx * dx + dz * dz)
  const horizontalScale = horizontal > 0 ? beyondDeadZone(horizontal, POSITION_DEAD_ZONE) / horizontal : 0
  const heightCorrection = beyondDeadZone(dy, HEIGHT_DEAD_ZONE) * POSITION_BLEND
  if (horizontalScale > 0 || heightCorrection !== 0) {
    body.setTranslation(
      {
        x: position.x + dx * horizontalScale * POSITION_BLEND,
        y: position.y + heightCorrection,
        z: position.z + dz * horizontalScale * POSITION_BLEND,
      },
      true,
    )
  }

  if (angle > ROTATION_DEAD_ZONE) {
    clientRotation.slerp(serverRotation, ROTATION_BLEND)
    body.setRotation({ x: clientRotation.x, y: clientRotation.y, z: clientRotation.z, w: clientRotation.w }, true)
  }

  // Vertical velocity belongs to the suspension. Leave it alone.
  body.setLinvel(
    {
      x: velocity.x + (server.velocity.x - velocity.x) * VELOCITY_BLEND,
      y: velocity.y,
      z: velocity.z + (server.velocity.z - velocity.z) * VELOCITY_BLEND,
    },
    true,
  )
}
