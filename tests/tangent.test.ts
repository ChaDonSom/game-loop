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
    grabTangent(dx, dy, R, { plus: L, minus: L }, "fixed")
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
  grabTangent(0, -R, R, { plus: L, minus: L }, "fixed")
  moveTangent(L / 2, -R)
  releaseWheel()
  const start = getWheelAngle()
  grabTangent(R, 0, R, { plus: L, minus: L }, "fixed")
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

  test(`edge reach ${name}: both ends land on the inset rect and give exactly ±lock`, () => {
    const r = Math.min(W, H) * frac
    const inset = wheelCenterInset("angular", r, r * 1.15)
    const rect = { left: EDGE_MARGIN, top: EDGE_MARGIN, right: W - EDGE_MARGIN, bottom: H - EDGE_MARGIN }
    const onEdge = (x: number, y: number) =>
      [x - rect.left, rect.right - x, y - rect.top, rect.bottom - y].some((d) => Math.abs(d) < 1e-6)
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * 2 * Math.PI
      const p0 = { x: inset + r * Math.cos(a), y: H - inset + r * Math.sin(a) }
      const t = tangentDirection(r * Math.cos(a), r * Math.sin(a), r)
      const { plus, minus } = tangentReach("edge", p0, t, rect)
      assert.ok(onEdge(p0.x + t.x * plus, p0.y + t.y * plus), `${name} ${k * 10}° plus end`)
      assert.ok(onEdge(p0.x - t.x * minus, p0.y - t.y * minus), `${name} ${k * 10}° minus end`)
      for (const angle0 of [0, halfLock / 3, -halfLock / 2]) {
        const grab = { mode: "edge" as const, t, p0, angle0, plus, minus, s: 0 }
        assert.ok(close(tangentAngle(grab, plus), halfLock), `${k} plus`)
        assert.ok(close(tangentAngle(grab, -minus), -halfLock), `${k} minus`)
        assert.ok(close(tangentAngle(grab, 0), angle0), `${k} zero`)
      }
    }
  })
}
