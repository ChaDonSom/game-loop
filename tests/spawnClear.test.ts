// Plan M5g: a new car spawns only on a clear spot.
import { test } from "node:test"
import assert from "node:assert/strict"
import { initChassis, initRapier, isSpawnClear, ramp, spawnPose } from "@game-loop/shared"

test("spawn clear: a car on slot 0 blocks it, the ramp does not", async () => {
  const { world } = await initRapier()
  ramp(world)
  world.step()
  assert.ok(isSpawnClear(world, 0), "empty slot on the ramp is clear")

  const parked = initChassis(world, 0)
  world.step()
  assert.equal(isSpawnClear(world, 0), false)
  assert.ok(isSpawnClear(world, 1), "the next slot is clear")

  parked.body.setTranslation({ x: 50, y: 5, z: 50 }, true)
  world.step()
  assert.ok(isSpawnClear(world, 0), "clear again after the car moves away")
  assert.ok(spawnPose(0).translation.y > 0)
})
