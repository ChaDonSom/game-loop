// Plan M5c: join and leave arrive on separate streams, in any order. The roster must end the same.
import { test } from "node:test"
import assert from "node:assert/strict"
import { Roster } from "../vue-client/src/roster.ts"

test("join then leave: gone", () => {
  const roster = new Roster()
  roster.apply("a", true, 1)
  roster.apply("a", false, 2)
  assert.equal(roster.has("a"), false)
  assert.equal(roster.size, 0)
})

test("leave before its join: stays gone", () => {
  const roster = new Roster()
  roster.apply("a", false, 2)
  roster.apply("a", true, 1)
  assert.equal(roster.has("a"), false)
})

test("all orders of the same events give the same roster", () => {
  const events: Array<[string, boolean, number]> = [
    ["a", true, 1],
    ["b", true, 2],
    ["a", false, 3],
    ["c", true, 4],
  ]
  const orders = [events, [...events].reverse(), [events[2], events[0], events[3], events[1]]]
  for (const order of orders) {
    const roster = new Roster()
    for (const [id, present, seq] of order) roster.apply(id, present, seq)
    assert.deepEqual(
      ["a", "b", "c"].map((id) => roster.has(id)),
      [false, true, true],
    )
  }
})

test("welcome snapshot: a newer join before welcome is kept", () => {
  const roster = new Roster()
  roster.apply("late", true, 6) // joined after the welcome was made, arrived first
  roster.applySnapshot(["me", "b"], 5)
  assert.ok(roster.has("me") && roster.has("b") && roster.has("late"))
  assert.equal(roster.size, 3)
})

test("welcome snapshot: an older entry missing from it is gone", () => {
  const roster = new Roster()
  roster.apply("old", true, 2)
  roster.applySnapshot(["me"], 5)
  assert.equal(roster.has("old"), false)
})

test("clear: a restarted server can use low rosterSeq again", () => {
  const roster = new Roster()
  roster.apply("a", false, 50)
  roster.clear()
  roster.apply("a", true, 1)
  assert.ok(roster.has("a"))
})
