// Fast-turn options: local circles, flick with momentum, adjustable lock.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CIRCLE_GAIN,
  FLICK_MIN_SPIN,
  getHalfLock,
  getWheelAngle,
  grabCircle,
  grabWheel,
  moveCircle,
  moveWheel,
  releaseWheel,
  resetWheel,
  updateWheel,
  wheelFlick,
  wheelLockSetting,
} from "../vue-client/src/input/touch.ts"

const still = { angle: 0, rearAngle: 0, forwardSpeed: 0, lateralSpeed: 0 }
const step = 1 / 60
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

/** A loop of `turns` around (cx, cy), radius r, in `n` points. Positive turns = clockwise on screen (y down). */
function loop(cx: number, cy: number, r: number, turns: number, n: number) {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * 2 * Math.PI
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

test("circles: one small clockwise loop anywhere turns the wheel +360° × gain", () => {
  resetWheel()
  const pts = loop(500, 300, 20, 1, 72)
  grabCircle(...pts[0]!)
  for (const p of pts.slice(1)) moveCircle(...p)
  releaseWheel()
  // The first direction reading needs CIRCLE_MIN_STEP_PX of travel and has no turn to compare with: on a 20 px
  // loop that loses about 4/20 rad (11°). So expect 360° minus up to 25°.
  const full = 2 * Math.PI * CIRCLE_GAIN
  const got = getWheelAngle()
  assert.ok(got <= Math.min(full, getHalfLock()) + 1e-9 && got > full - (25 * Math.PI) / 180, `${got} vs ${full}`)
})

test("circles: counter-clockwise turns left; a straight drag does not steer", () => {
  resetWheel()
  const pts = loop(100, 100, 15, -0.5, 36)
  grabCircle(...pts[0]!)
  for (const p of pts.slice(1)) moveCircle(...p)
  assert.ok(getWheelAngle() < -2.5, `${getWheelAngle()}`)
  const before = getWheelAngle()
  for (let x = 0; x < 300; x += 10) moveCircle(pts[pts.length - 1]![0] + x, pts[pts.length - 1]![1] + 40)
  // Only the turn onto the straight line counts, then nothing.
  const after = getWheelAngle()
  for (let x = 300; x < 600; x += 10) moveCircle(pts[pts.length - 1]![0] + x, pts[pts.length - 1]![1] + 40)
  assert.equal(getWheelAngle(), after)
  assert.ok(after !== undefined && before !== undefined)
  releaseWheel()
})

/** Drag the wheel clockwise at `degPerStep` for `steps` physics steps (angular mode), then release. */
function spinAndRelease(degPerStep: number, steps: number) {
  resetWheel()
  const r = 80
  let a = 0
  grabWheel(0, -r, r)
  for (let i = 0; i < steps; i++) {
    a += (degPerStep * Math.PI) / 180
    moveWheel(r * Math.sin(a), -r * Math.cos(a), r)
    updateWheel(step, 0, still)
  }
  releaseWheel()
  return getWheelAngle()
}

test("flick off: the wheel stays where you let go", () => {
  wheelFlick.set("off")
  const atRelease = spinAndRelease(6, 10)
  for (let i = 0; i < 60; i++) updateWheel(step, 0, still)
  assert.ok(close(getWheelAngle(), atRelease))
})

test("flick on: a fast release keeps turning, slows down, and stops", () => {
  wheelFlick.set("on")
  const atRelease = spinAndRelease(6, 10) // 6°/step = 360°/s, above FLICK_MIN_SPIN
  assert.ok((360 * Math.PI) / 180 > FLICK_MIN_SPIN)
  updateWheel(step, 0, still)
  const after1 = getWheelAngle()
  for (let i = 0; i < 300; i++) updateWheel(step, 0, still)
  const settled = getWheelAngle()
  updateWheel(step, 0, still)
  assert.ok(after1 > atRelease, "keeps turning")
  assert.ok(settled > after1, "coasts further")
  assert.ok(close(getWheelAngle(), settled), "then stops")
  assert.ok(settled <= getHalfLock() + 1e-9, "never past lock")
})

test("flick on: a slow release does not coast", () => {
  wheelFlick.set("on")
  const atRelease = spinAndRelease(0.5, 30) // 30°/s, below FLICK_MIN_SPIN
  for (let i = 0; i < 60; i++) updateWheel(step, 0, still)
  assert.ok(close(getWheelAngle(), atRelease))
  wheelFlick.set("off")
})

test("lock: a new lock keeps the steer fraction", () => {
  resetWheel()
  wheelLockSetting.set(900)
  const r = 80
  grabWheel(0, -r, r)
  for (let a = 5; a <= 90; a += 5) moveWheel(r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180), r)
  releaseWheel()
  const fraction = getWheelAngle() / getHalfLock()
  wheelLockSetting.set(360)
  return new Promise<void>((done) =>
    setTimeout(() => {
      assert.ok(close(getHalfLock(), Math.PI), `half lock ${getHalfLock()}`)
      assert.ok(close(getWheelAngle() / getHalfLock(), fraction))
      wheelLockSetting.set(900)
      done()
    }),
  )
})
