import type RAPIER from "@dimforge/rapier3d-compat"
import * as THREE from "three"

/**
 * Turns a fixed-step physics body into a smooth pose to draw.
 *
 * Two problems it solves:
 * 1. Physics steps at 60 Hz, but frames do not line up with steps. A frame gets 0, 1 or 2 steps. At 50 m/s one step
 *    is ~0.8 m, so drawing the raw body made the car jump forward and back. We draw a blend of the last two steps
 *    (`alpha` = how far the accumulator is into the next step).
 * 2. Server corrections move the body at once. We move the body, but keep the old drawn pose as an offset that fades
 *    out over ~0.1 s. The physics takes the correction now; the eye sees a short glide.
 */

/** How fast a correction offset fades, per second. 15/s removes ~95% in 0.2 s. */
const OFFSET_DECAY_RATE = 15
/** Offsets above this are not worth gliding over (a respawn or a big snap). Drop them, in metres. */
const MAX_POSITION_OFFSET = 8

export default class RenderSmoothing {
  private readonly previousPosition = new THREE.Vector3()
  private readonly currentPosition = new THREE.Vector3()
  private readonly previousRotation = new THREE.Quaternion()
  private readonly currentRotation = new THREE.Quaternion()
  private readonly positionOffset = new THREE.Vector3()
  private readonly rotationOffset = new THREE.Quaternion()

  private readonly beforePosition = new THREE.Vector3()
  private readonly beforeRotation = new THREE.Quaternion()
  private readonly delta = new THREE.Vector3()
  private readonly deltaRotation = new THREE.Quaternion()
  private readonly identity = new THREE.Quaternion()

  private readonly body: RAPIER.RigidBody

  constructor(body: RAPIER.RigidBody) {
    this.body = body
    this.reset()
  }

  /** Forget the history and offsets. Use after a respawn, so the car does not glide from the old place. */
  reset() {
    this.readBody(this.currentPosition, this.currentRotation)
    this.previousPosition.copy(this.currentPosition)
    this.previousRotation.copy(this.currentRotation)
    this.positionOffset.set(0, 0, 0)
    this.rotationOffset.identity()
  }

  /** Call just before each `world.step()`. */
  beforeStep() {
    this.readBody(this.previousPosition, this.previousRotation)
  }

  /** Call just after each `world.step()`. */
  afterStep() {
    this.readBody(this.currentPosition, this.currentRotation)
  }

  /** Call before code that moves the body outside a physics step (a server correction). */
  beginCorrection() {
    this.readBody(this.beforePosition, this.beforeRotation)
  }

  /** Call after that code. The move goes into the physics history, and the drawn pose stays put. */
  endCorrection() {
    const position = this.body.translation()
    const rotation = this.body.rotation()

    this.delta.set(position.x, position.y, position.z).sub(this.beforePosition)
    this.previousPosition.add(this.delta)
    this.currentPosition.add(this.delta)
    this.positionOffset.sub(this.delta)
    if (this.positionOffset.length() > MAX_POSITION_OFFSET) this.positionOffset.set(0, 0, 0)

    // deltaRotation takes the old orientation to the new one (world frame): after = delta * before.
    this.deltaRotation.set(rotation.x, rotation.y, rotation.z, rotation.w).multiply(this.beforeRotation.invert())
    this.previousRotation.premultiply(this.deltaRotation)
    this.currentRotation.premultiply(this.deltaRotation)
    // Drawn = offset * physics. Keep the drawn rotation unchanged: offset = offset * inverse(delta).
    this.rotationOffset.multiply(this.deltaRotation.invert())
  }

  /**
   * Writes the pose to draw into `position` and `rotation`.
   * @param alpha How far into the next physics step this frame is, from 0 to 1.
   * @param dt Frame time in seconds, for fading the offsets.
   */
  sample(alpha: number, dt: number, position: THREE.Vector3, rotation: THREE.Quaternion) {
    const fade = Math.exp(-OFFSET_DECAY_RATE * dt)
    this.positionOffset.multiplyScalar(fade)
    this.rotationOffset.slerp(this.identity, 1 - fade)

    position.lerpVectors(this.previousPosition, this.currentPosition, alpha).add(this.positionOffset)
    rotation.slerpQuaternions(this.previousRotation, this.currentRotation, alpha).premultiply(this.rotationOffset)
  }

  private readBody(position: THREE.Vector3, rotation: THREE.Quaternion) {
    const p = this.body.translation()
    const r = this.body.rotation()
    position.set(p.x, p.y, p.z)
    rotation.set(r.x, r.y, r.z, r.w)
  }
}
