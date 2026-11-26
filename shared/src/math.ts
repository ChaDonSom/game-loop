export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

/** `v` rotated by the unit quaternion `q` (local to world). */
export function rotateByQuat(q: Quat, v: Vec3): Vec3 {
  // t = 2 · (q.xyz × v); result = v + q.w · t + q.xyz × t
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  }
}

/**
 * Chassis axes in world frame. The car's nose is local −z (where the front wheels sit), and local +x is its right
 * side (the "Front-Right" wheel sits at +x in `rapier/wheels.ts`).
 */
export function chassisAxes(q: Quat) {
  return { forward: rotateByQuat(q, { x: 0, y: 0, z: -1 }), right: rotateByQuat(q, { x: 1, y: 0, z: 0 }) }
}

export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
