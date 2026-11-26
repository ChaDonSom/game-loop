// Plan T: banked path shape, banks where they must be, and no overlapping pieces.
import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_TERRAIN_LAYOUT, buildTerrainPhysics, initRapier } from "@game-loop/shared"
import { bankedPathGeometry, bankedPathSamples } from "../shared/dist/terrain/bankedPath.js"

const DEG = 180 / Math.PI
const paths = DEFAULT_TERRAIN_LAYOUT.filter((p) => p.kind === "bankedPath")
const byId = (id: string) => {
  const piece = paths.find((p) => p.id === id)
  assert.ok(piece, id)
  return piece
}

test("every piece builds in Rapier", async () => {
  const { world } = await initRapier()
  const terrain = buildTerrainPhysics(world, DEFAULT_TERRAIN_LAYOUT)
  assert.equal(terrain.pieces.length, DEFAULT_TERRAIN_LAYOUT.length)
  terrain.dispose()
})

test("report: largest bank per segment (degrees)", () => {
  for (const piece of paths) {
    const samples = bankedPathSamples(piece)
    const most = new Map<number, number>()
    for (const s of samples) most.set(s.segment, Math.max(most.get(s.segment) ?? 0, Math.abs(s.bank) * DEG))
    const text = [...most].map(([seg, deg]) => `${seg < 0 ? "lead" : seg}: ${deg.toFixed(1)}°`).join(", ")
    console.log(`${piece.id} (full ${(piece.bankAngle * DEG).toFixed(1)}°): ${text}`)
  }
})

test("oval closes with no gap at the seam", () => {
  const oval = byId("banked-oval")
  const samples = bankedPathSamples(oval)
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  const step = Math.hypot(samples[1]!.x - first.x, samples[1]!.z - first.z)
  const seam = Math.hypot(first.x - last.x, first.z - last.z)
  assert.ok(Math.abs(seam - step) < 0.05, `seam ${seam} vs step ${step}`)
  // A full lap of left turns: heading ends one step short of 2π.
  assert.ok(Math.abs(last.heading - 2 * Math.PI) < 0.1)
})

test("oval straights reach their own bank in the middle, and ease over a third of their length", () => {
  const oval = byId("banked-oval")
  const samples = bankedPathSamples(oval)
  for (const segment of [0, 2]) {
    const straight = oval.segments[segment]!
    assert.ok(straight.type === "straight" && straight.bank !== undefined)
    const on = samples.filter((s) => s.segment === segment)
    const mid = on[Math.floor(on.length / 2)]!
    assert.ok(Math.abs(mid.bank - straight.bank) < 1e-9, `straight ${segment} middle bank ${mid.bank * DEG}°`)
    const easing = on.filter((s) => Math.abs(s.bank - straight.bank) > 1e-6).length / on.length
    assert.ok(Math.abs(easing - 1 / 3) < 0.05, `straight ${segment}: ${(easing * 100).toFixed(0)}% easing`)
  }
})

test("oval ramp top meets the outer edge height, and the barrier has a gap there", () => {
  const oval = byId("banked-oval")
  const ramp = DEFAULT_TERRAIN_LAYOUT.find((p) => p.id === "banked-oval-ramp")
  assert.ok(ramp && ramp.kind === "ramp")
  const straight = oval.segments[0]!
  assert.ok(straight.type === "straight")
  const edge = oval.roadWidth * Math.tan(straight.bank ?? 0)
  assert.ok(Math.abs(ramp.height - edge) < 0.02, `ramp ${ramp.height} vs edge ${edge}`)
  // Highest wall vertex near the ramp, on the outer side, must be no higher than the road edge (no barrier).
  const { vertices } = bankedPathGeometry(oval)
  const c = Math.cos(oval.rotationY)
  const sn = Math.sin(oval.rotationY)
  const top = (ramp.position.x + Math.sin(ramp.rotationY) * ramp.length)
  const topZ = ramp.position.z + Math.cos(ramp.rotationY) * ramp.length
  let highest = 0
  for (let i = 0; i < vertices.length; i += 3) {
    const wx = oval.position.x + vertices[i]! * c + vertices[i + 2]! * sn
    const wz = oval.position.z - vertices[i]! * sn + vertices[i + 2]! * c
    if (Math.hypot(wx - top, wz - topZ) < ramp.width / 2 - 0.5) highest = Math.max(highest, vertices[i + 1]!)
  }
  assert.ok(highest <= edge + 0.05, `wall at the ramp: ${highest.toFixed(2)} m, edge ${edge.toFixed(2)} m`)
})

test("S curve bank flips sides and is flat at the crossover", () => {
  const s = byId("banked-s-curve")
  const samples = bankedPathSamples(s)
  const mid = samples.filter((x) => x.segment === 1)
  const middle = mid[Math.floor(mid.length / 2)]!
  assert.ok(Math.abs(middle.bank) * DEG < 2, `crossover bank ${middle.bank * DEG}°`)
  assert.ok(Math.max(...samples.filter((x) => x.segment === 0).map((x) => x.bank)) > 0, "left arc: left edge low")
  assert.ok(Math.min(...samples.filter((x) => x.segment === 2).map((x) => x.bank)) < 0, "right arc: right edge low")
})

test("open paths start and end flat", () => {
  for (const piece of paths.filter((p) => !p.closed)) {
    const samples = bankedPathSamples(piece)
    assert.equal(samples[0]!.bank, 0, piece.id)
    assert.ok(Math.abs(samples[samples.length - 1]!.bank) < 1e-9, piece.id)
  }
})

/** World-frame box of a piece, from its sizes or its geometry. */
function bounds(piece: (typeof DEFAULT_TERRAIN_LAYOUT)[number]) {
  const pts: Array<[number, number]> = []
  if (piece.kind === "bankedPath") {
    const v = bankedPathGeometry(piece).vertices
    for (let i = 0; i < v.length; i += 3) pts.push([v[i]!, v[i + 2]!])
  } else if (piece.kind === "ramp") {
    pts.push([-piece.width / 2, 0], [piece.width / 2, 0], [-piece.width / 2, piece.length], [piece.width / 2, piece.length])
  } else {
    const hx = piece.kind === "bump" ? piece.width / 2 : piece.sizeX / 2
    const hz = piece.kind === "bump" ? piece.length / 2 : piece.sizeZ / 2
    pts.push([-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz])
  }
  const c = Math.cos(piece.rotationY)
  const s = Math.sin(piece.rotationY)
  const xs = pts.map(([x, z]) => piece.position.x + x * c + z * s)
  const zs = pts.map(([x, z]) => piece.position.z - x * s + z * c)
  return { id: piece.id, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

test("no two pieces overlap, none touches the spawn ramp, all inside the walls", () => {
  const boxes = [...DEFAULT_TERRAIN_LAYOUT.map(bounds), { id: "spawn ramp", minX: -3, maxX: 3, minZ: -16, maxZ: 6 }]
  for (const b of boxes) {
    assert.ok(b.minX > -499 && b.maxX < 499 && b.minZ > -499 && b.maxZ < 499, `${b.id} inside the walls`)
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      // The oval's entry ramp touches the oval on purpose.
      const pair = [a.id, b.id].sort().join(" + ")
      if (pair === "banked-oval + banked-oval-ramp") continue
      const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`)
    }
  }
})

test("oval and S curve stay in their planned regions", () => {
  const oval = bounds(byId("banked-oval"))
  assert.ok(oval.minX >= -200 && oval.maxX <= 200 && oval.minZ >= -480 && oval.maxZ <= -40, JSON.stringify(oval))
  const s = bounds(byId("banked-s-curve"))
  assert.ok(s.minX >= 60 && s.maxX <= 400 && s.minZ >= 60 && s.maxZ <= 480, JSON.stringify(s))
})
