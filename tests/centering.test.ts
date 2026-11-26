// Plan C: centering target, centering step, and the haptic tap rule.
import { test } from "node:test"
import assert from "node:assert/strict"
import { MAX_STEERING } from "@game-loop/shared"
import {
  VISUAL_LOCK,
  centerTarget,
  getWheelAngle,
  getWheelTarget,
  grabWheel,
  moveWheel,
  releaseWheel,
  resetWheel,
  setTapSink,
  updateWheel,
} from "../vue-client/src/input/touch.ts"

const halfLock = VISUAL_LOCK / 2
const slip = (angle: number, rearAngle: number, forwardSpeed = 20) => ({ angle, rearAngle, forwardSpeed, lateralSpeed: 0 })

test("target: straight when stopped or reversing, full 0-front-slip at speed", () => {
  assert.equal(centerTarget(slip(0.1, 0, 0)), 0)
  assert.equal(centerTarget(slip(0.1, 0, -5)), 0)
  assert.ok(Math.abs(centerTarget(slip(0.1, 0, 20)) - (0.1 / MAX_STEERING) * halfLock) < 1e-9)
  assert.equal(centerTarget(slip(1, 0, 20)), halfLock, "clamped at lock")
})

test("released wheel moves toward the target and stops on it", () => {
  resetWheel()
  const s = slip(0.2, 0.3)
  for (let i = 0; i < 600; i++) updateWheel(1 / 60, 10, s)
  assert.ok(Math.abs(getWheelAngle() - getWheelTarget()) < 1e-9)
  assert.ok(getWheelTarget() > 0)
})

/** Hold the wheel and sweep it from 0 past the target, one step per physics step. */
function sweep(s: ReturnType<typeof slip>) {
  resetWheel()
  let taps = 0
  setTapSink(() => taps++)
  // Turn the wheel clockwise from 0 to 400° (past the 200° target) in 3° steps, one per physics step.
  const r = 80
  grabWheel(0, -r, r)
  for (let deg = 3; deg <= 400; deg += 3) {
    const a = (deg * Math.PI) / 180
    moveWheel(r * Math.sin(a), -r * Math.cos(a), r)
    updateWheel(1 / 60, 10, s)
  }
  // Rest on lock for a while: no more taps.
  for (let i = 0; i < 30; i++) updateWheel(1 / 60, 10, s)
  releaseWheel()
  updateWheel(1 / 60, 0, s)
  return taps
}

test("tap: once when the held wheel reaches the target in a slide", () => {
  assert.equal(sweep(slip(0.2, 0.4)), 1)
})

test("tap: none in a normal corner (small rear slip)", () => {
  assert.equal(sweep(slip(0.2, 0.02)), 0)
})
