// Plan W: tangent drag math, reach, and wheel placement.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  EDGE_MARGIN,
  PHONE_WHEEL_RADIUS_FRAC,
  TANGENT_REACH_PX,
  VISUAL_LOCK,
  WHEEL_RADIUS_FRAC,
  getWheelAngle,
  grabTangent,
  moveTangent,
  releaseWheel,
  resetWheel,
  tangentAngle,
  tangentDirection,
  tangentReach,
  wheelCenterInset,
} from "../vue-client/src/input/touch.ts"

const halfLock = VISUAL_LOCK / 2
const R = 80
const L = TANGENT_REACH_PX
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

const grabs: Record<string, [number, number]> = {
  top: [0, -R],
  right: [R, 0],
  bottom: [0, R],
  left: [-R, 0],
  center: [0, 0],
}

for (const [name, [dx, dy]] of Object.entries(grabs)) {
  test(`grab ${name}: +L along t gives +lock, across t no change, back to p0 gives angle0`, () => {
    resetWheel()
    const t = tangentDirection(dx, dy, R)
    grabTangent(dx, dy, R, L, "fixed")
    moveTangent(dx + t.x * L, dy + t.y * L)
    assert.ok(close(getWheelAngle(), halfLock), `${name}: ${getWheelAngle()}`)
    moveTangent(dx - t.y * 50, dy + t.x * 50) // perpendicular to t
    assert.ok(close(getWheelAngle(), 0), `${name} across: ${getWheelAngle()}`)
    moveTangent(dx, dy)
    assert.equal(getWheelAngle(), 0)
    releaseWheel()
  })
}

test("clockwise check: top grab drags right, right-side grab drags down", () => {
  assert.deepEqual(tangentDirection(0, -R, R), { x: 1, y: 0 })
  const right = tangentDirection(R, 0, R)
  assert.ok(close(right.x, 0) && close(right.y, 1))
})

test("a new grab starts from the current angle", () => {
  resetWheel()
  grabTangent(0, -R, R, L, "fixed")
  moveTangent(L / 2, -R)
  releaseWheel()
  const start = getWheelAngle()
  grabTangent(R, 0, R, L, "fixed")
  moveTangent(R, 0)
  assert.equal(getWheelAngle(), start)
  releaseWheel()
})

const layouts = { phone: { W: 844, H: 390, frac: PHONE_WHEEL_RADIUS_FRAC }, desktop: { W: 1280, H: 720, frac: WHEEL_RADIUS_FRAC } }

for (const [name, { W, H, frac }] of Object.entries(layouts)) {
  test(`W4a ${name}: p0 ± L·t stays on screen for 36 rim grabs`, () => {
    const r = Math.min(W, H) * frac
    const hitR = r * 1.15
    const inset = wheelCenterInset("tangent", r, hitR)
    const cx = inset
    const cy = H - inset
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * 2 * Math.PI
      const dx = hitR * Math.cos(a)
      const dy = hitR * Math.sin(a)
      const t = tangentDirection(dx, dy, r)
      for (const sign of [1, -1]) {
        const x = cx + dx + sign * t.x * L
        const y = cy + dy + sign * t.y * L
        assert.ok(x >= -1e-9 && x <= W && y >= 0 && y <= H + 1e-9, `${name} grab ${k * 10}°: (${x}, ${y})`)
      }
    }
  })

  test(`edge reach ${name}: both halves equal the shorter one, which ends on the inset rect`, () => {
    const r = Math.min(W, H) * frac
    const inset = wheelCenterInset("tangent", r, r * 1.15)
    const rect = { left: EDGE_MARGIN, top: EDGE_MARGIN, right: W - EDGE_MARGIN, bottom: H - EDGE_MARGIN }
    const inside = (x: number, y: number) =>
      x >= rect.left - 1e-6 && x <= rect.right + 1e-6 && y >= rect.top - 1e-6 && y <= rect.bottom + 1e-6
    const onEdge = (x: number, y: number) =>
      [x - rect.left, rect.right - x, y - rect.top, rect.bottom - y].some((d) => Math.abs(d) < 1e-6)
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * 2 * Math.PI
      const p0 = { x: inset + r * Math.cos(a), y: H - inset + r * Math.sin(a) }
      const t = tangentDirection(r * Math.cos(a), r * Math.sin(a), r)
      const reach = tangentReach("edge", p0, t, rect)
      const plusEnd = [p0.x + t.x * reach, p0.y + t.y * reach] as const
      const minusEnd = [p0.x - t.x * reach, p0.y - t.y * reach] as const
      assert.ok(inside(...plusEnd) && inside(...minusEnd), `${name} ${k * 10}°: both ends on screen`)
      assert.ok(onEdge(...plusEnd) || onEdge(...minusEnd), `${name} ${k * 10}°: the shorter half ends on the edge`)
      const grab = { mode: "edge" as const, t, p0, angle0: 0, reach, s: 0 }
      assert.ok(close(tangentAngle(grab, reach), halfLock), `${k} plus lock`)
      assert.ok(close(tangentAngle(grab, -reach), -halfLock), `${k} minus lock`)
      // Same rate both ways, from any start angle.
      const off = { ...grab, angle0: halfLock / 3 }
      assert.ok(close(tangentAngle(off, 10) - off.angle0, off.angle0 - tangentAngle(off, -10)), `${k} same rate`)
    }
  })
}
