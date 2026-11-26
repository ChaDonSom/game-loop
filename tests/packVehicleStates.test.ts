// Plan M5a and M5d: `state` comes in parts that fit one datagram, and rounding keeps the shape.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  decodeMessage,
  isServerDatagramMessage,
  packVehicleStates,
  roundVehicleState,
  type VehicleState,
} from "@game-loop/shared"

/** Full-precision numbers, as the server reads them from Rapier: the worst case for size. */
function car(index: number): VehicleState {
  const n = (k: number) => Math.sin(index * 7.3 + k) * 37.123456789012345
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ack: 123456,
    ackAgeMs: 12,
    position: { x: n(1), y: n(2), z: n(3) },
    rotation: { x: n(4) / 40, y: n(5) / 40, z: n(6) / 40, w: n(7) / 40 },
    velocity: { x: n(8), y: n(9), z: n(10) },
    angularVelocity: { x: n(11), y: n(12), z: n(13) },
    steering: n(14) / 100,
  }
}

const MAX = 1100

for (const round of [false, true]) {
  test(`${round ? "rounded" : "full precision"}: parts fit, each car once, one seq`, () => {
    for (let count = 1; count <= 16; count++) {
      const players = Array.from({ length: count }, (_, i) => (round ? roundVehicleState(car(i)) : car(i)))
      const parts = packVehicleStates(players, 42, 1000, MAX)
      const seen: string[] = []
      for (const part of parts) {
        assert.ok(part.length <= MAX, `${count} cars: part of ${part.length} B`)
        const msg = decodeMessage(part)
        assert.ok(isServerDatagramMessage(msg) && msg.type === "state")
        assert.equal(msg.seq, 42)
        assert.ok(msg.players.length >= 1)
        seen.push(...msg.players.map((p) => p.id))
      }
      assert.deepEqual(seen, players.map((p) => p.id))
    }
  })
}

test("rounding: 3 cars fit in one part", () => {
  const players = [0, 1, 2].map((i) => roundVehicleState(car(i)))
  assert.equal(packVehicleStates(players, 1, 1000, MAX).length, 1)
})

test("a car bigger than the budget still goes, alone", () => {
  const parts = packVehicleStates([car(0), car(1)], 1, 1000, 100)
  assert.equal(parts.length, 2)
})

test("no cars: no parts", () => {
  assert.equal(packVehicleStates([], 1, 1000, MAX).length, 0)
})
