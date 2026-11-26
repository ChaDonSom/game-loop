// Fast-turn options: flick with momentum, adjustable lock.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  FLICK_MIN_SPIN,
  getHalfLock,
  getWheelAngle,
  grabWheel,
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

/** Drag the wheel clockwise at `degPerStep` for `steps` physics steps, then release. */
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

test("flick on: a quick tap catches a coasting wheel, even between two physics steps", () => {
  wheelFlick.set("on")
  spinAndRelease(6, 10)
  for (let i = 0; i < 3; i++) updateWheel(step, 0, still)
  const caught = getWheelAngle()
  grabWheel(0, -80, 80) // tap: grab and release with no step between
  releaseWheel()
  for (let i = 0; i < 60; i++) updateWheel(step, 0, still)
  assert.ok(close(getWheelAngle(), caught), `${getWheelAngle()} vs ${caught}`)
  wheelFlick.set("off")
})

test("lock: changing it while held does not read as a spin (no flick on release)", async () => {
  wheelFlick.set("on")
  resetWheel()
  wheelLockSetting.set(900)
  const r = 80
  grabWheel(0, -r, r)
  for (let a = 5; a <= 180; a += 5) moveWheel(r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180), r)
  for (let i = 0; i < 30; i++) updateWheel(step, 0, still) // held still: spin estimate settles to 0
  wheelLockSetting.set(360)
  await new Promise((resolve) => setTimeout(resolve))
  updateWheel(step, 0, still)
  releaseWheel()
  const atRelease = getWheelAngle()
  for (let i = 0; i < 60; i++) updateWheel(step, 0, still)
  try {
    assert.ok(close(getWheelAngle(), atRelease), `coasted from ${atRelease} to ${getWheelAngle()}`)
  } finally {
    wheelLockSetting.set(900)
    wheelFlick.set("off")
  }
})

test("lock: a new lock keeps the steer fraction", async () => {
  resetWheel()
  wheelLockSetting.set(900)
  const r = 80
  grabWheel(0, -r, r)
  for (let a = 5; a <= 90; a += 5) moveWheel(r * Math.sin((a * Math.PI) / 180), -r * Math.cos((a * Math.PI) / 180), r)
  releaseWheel()
  const fraction = getWheelAngle() / getHalfLock()
  wheelLockSetting.set(360)
  await new Promise((resolve) => setTimeout(resolve)) // the watcher runs after this tick
  try {
    assert.ok(close(getHalfLock(), Math.PI), `half lock ${getHalfLock()}`)
    assert.ok(close(getWheelAngle() / getHalfLock(), fraction))
  } finally {
    wheelLockSetting.set(900)
  }
})
