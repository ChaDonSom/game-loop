import type RAPIER from "@dimforge/rapier3d-compat"
import { chassisAxes, dot, rotateByQuat } from "../math.js"
import { axleOffsetZ } from "../rapier/wheels.js"
import { VEHICLE_DIMENSIONS } from "./dimensions.js"

export type FrontAxleSlip = {
  /**
   * Road-wheel angle (radians) that points along the front axle's velocity, relative to the nose.
   * Positive = to the right, the same sign as `pad.steer` (the drive code flips it for Rapier).
   * 0 when the axle is not moving forward: undefined at a stop, and flipped in reverse.
   */
  angle: number
  /** Front axle velocity along the nose, m/s. Negative in reverse. */
  forwardSpeed: number
  /** Front axle velocity toward the car's right side, m/s. */
  lateralSpeed: number
  /**
   * The same angle at the rear axle. The rear wheels do not steer, so this is the rear slip angle: small in a normal
   * corner, large when the rear slides. 0 when the rear axle is not moving forward.
   */
  rearAngle: number
}

/**
 * Where the front axle is going, relative to where the nose points. A released steering wheel turns toward this
 * angle in reality: there the front tires carry no side force (0 front slip angle). In a slide it is countersteer.
 *
 * Axle velocity = v + ω × r, with r from the body origin. The chassis collider is centred on the body with uniform
 * density, so the origin is the centre of mass.
 */
export function frontAxleSlip(body: RAPIER.RigidBody, chassisLength = VEHICLE_DIMENSIONS.chassis.length): FrontAxleSlip {
  const q = body.rotation()
  const v = body.linvel()
  const w = body.angvel()
  const { forward, right } = chassisAxes(q)
  const axleOffset = axleOffsetZ(chassisLength)

  // Velocity of the point at local (0, 0, z): v + ω × r.
  const pointVelocity = (z: number) => {
    const r = rotateByQuat(q, { x: 0, y: 0, z })
    return { x: v.x + (w.y * r.z - w.z * r.y), y: v.y + (w.z * r.x - w.x * r.z), z: v.z + (w.x * r.y - w.y * r.x) }
  }
  const angleOf = (fwd: number, lat: number) => (fwd > 0 ? Math.atan2(lat, fwd) : 0)

  const front = pointVelocity(-axleOffset)
  const rear = pointVelocity(axleOffset)
  const forwardSpeed = dot(forward, front)
  const lateralSpeed = dot(right, front)
  return {
    angle: angleOf(forwardSpeed, lateralSpeed),
    forwardSpeed,
    lateralSpeed,
    rearAngle: angleOf(dot(forward, rear), dot(right, rear)),
  }
}
