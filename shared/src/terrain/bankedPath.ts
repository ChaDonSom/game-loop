import type { BankedPathPiece, PathSegment } from "./types.js"

/** Lifts flat pieces just above the ground, so the wheel rays hit them first and they do not flicker. */
export const GROUND_CLEARANCE = 0.01
/** Vertices across the road, minus one. */
const ACROSS = 4
/** Wall quads lower than this (m) are left out: on flat road the wall would be a sliver. */
const WALL_MIN_HEIGHT = 0.02

/** One point on the centre line, in the piece frame. */
export type PathSample = {
  /** Distance along the centre line, m. */
  s: number
  x: number
  z: number
  /** 0 = facing +Z. Grows when the path turns left (toward +X). */
  heading: number
  /** Signed bank, radians. Positive = the left edge is low (a left turn). Negative = the right edge is low. */
  bank: number
  /** Index in `piece.segments`. −1 for the flat lead-in and lead-out of an open path. */
  segment: number
}

type Walked = { segment: PathSegment; index: number; start: number; length: number; target: number }

const forwardOf = (h: number) => ({ x: Math.sin(h), z: Math.cos(h) })
const leftOf = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) })

function segmentLength(segment: PathSegment) {
  return segment.type === "straight" ? segment.length : segment.radius * segment.angle
}

function targetBank(segment: PathSegment, bankAngle: number) {
  if (segment.type === "straight") return 0
  return segment.turn === "left" ? bankAngle : -bankAngle
}

/** The segment list with a flat lead-in and lead-out of half an ease length on an open path. */
function walkedSegments(piece: BankedPathPiece): Walked[] {
  const lead: PathSegment = { type: "straight", length: piece.easeLength / 2 }
  const list = piece.closed
    ? piece.segments.map((segment, index) => ({ segment, index }))
    : [{ segment: lead, index: -1 }, ...piece.segments.map((segment, index) => ({ segment, index })), { segment: lead, index: -1 }]
  let start = 0
  return list.map(({ segment, index }) => {
    const length = segmentLength(segment)
    const walked = { segment, index, start, length, target: targetBank(segment, piece.bankAngle) }
    start += length
    return walked
  })
}

/**
 * Cumulative distribution of a triangle kernel `easeLength` wide, at u = offset / easeLength in [−½, ½].
 * A step smoothed by it eases in and out (quadratic each side), so the roll rate has no jump at either end.
 */
function easeCdf(u: number) {
  if (u <= -0.5) return 0
  if (u >= 0.5) return 1
  return u < 0 ? 2 * (u + 0.5) ** 2 : 1 - 2 * (0.5 - u) ** 2
}

/**
 * Bank at distance `s`: the segment's target bank, smoothed over `easeLength` around every boundary where the
 * target changes. Smoothing is a convolution, so overlapping eases on a short segment blend by themselves.
 */
function bankAt(s: number, walked: Walked[], total: number, piece: BankedPathPiece) {
  const ease = piece.easeLength
  const here = walked.find((w) => s >= w.start && s < w.start + w.length) ?? walked[walked.length - 1]!
  let bank = here.target
  if (ease <= 0) return bank
  const count = walked.length
  for (let i = 0; i < count; i++) {
    const next = walked[i + 1] ?? (piece.closed ? walked[0] : undefined)
    if (!next) continue
    const step = next.target - walked[i]!.target
    if (step === 0) continue
    const boundary = walked[i]!.start + walked[i]!.length
    // On a closed path the boundary also repeats one lap before and after.
    for (const lap of piece.closed ? [-total, 0, total] : [0]) {
      const u = (s - (boundary + lap)) / ease
      if (Math.abs(u) >= 0.5) continue
      bank += step * (easeCdf(u) - (u >= 0 ? 1 : 0))
    }
  }
  return bank
}

/** Centre-line samples. An open path includes its end point. A closed path stops one step short: it joins its start. */
export function bankedPathSamples(piece: BankedPathPiece): PathSample[] {
  const walked = walkedSegments(piece)
  const total = walked.reduce((sum, w) => sum + w.length, 0)
  const samples: PathSample[] = []
  let x = 0
  let z = 0
  let heading = 0

  for (const w of walked) {
    const steps = Math.max(1, Math.ceil(w.length * piece.resolution))
    const x0 = x
    const z0 = z
    const h0 = heading
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const point = pointOn(w.segment, x0, z0, h0, t)
      samples.push({ s: w.start + t * w.length, ...point, bank: 0, segment: w.index })
    }
    const end = pointOn(w.segment, x0, z0, h0, 1)
    x = end.x
    z = end.z
    heading = end.heading
  }
  if (!piece.closed) samples.push({ s: total, x, z, heading, bank: 0, segment: walked[walked.length - 1]!.index })

  for (const sample of samples) sample.bank = bankAt(sample.s, walked, total, piece)
  return samples
}

/** Point a fraction `t` along one segment that starts at (x0, z0) facing h0. */
function pointOn(segment: PathSegment, x0: number, z0: number, h0: number, t: number) {
  if (segment.type === "straight") {
    const f = forwardOf(h0)
    return { x: x0 + f.x * segment.length * t, z: z0 + f.z * segment.length * t, heading: h0 }
  }
  const side = segment.turn === "left" ? 1 : -1
  const l0 = leftOf(h0)
  const cx = x0 + side * l0.x * segment.radius
  const cz = z0 + side * l0.z * segment.radius
  const heading = h0 + side * segment.angle * t
  const l = leftOf(heading)
  return { x: cx - side * l.x * segment.radius, z: cz - side * l.z * segment.radius, heading }
}

/**
 * Shape of a banked path: the road surface, plus a wall on the raised edge from the ground up to the road edge
 * (the skirt) and `barrierHeight` above it (the barrier). Used for the trimesh collider and, through it, the mesh.
 */
export function bankedPathGeometry(piece: BankedPathPiece) {
  const samples = bankedPathSamples(piece)
  const half = piece.roadWidth / 2
  const vertices: number[] = []
  const indices: number[] = []
  const rows = samples.length
  const pairs = piece.closed ? rows : rows - 1
  const next = (i: number) => (i + 1) % rows

  // Road surface: ACROSS + 1 vertices per sample, from the left edge to the right edge.
  for (const sample of samples) {
    const l = leftOf(sample.heading)
    const tilt = Math.tan(Math.abs(sample.bank))
    for (let a = 0; a <= ACROSS; a++) {
      const u = half - (a / ACROSS) * piece.roadWidth // +half = left edge
      const fromLow = sample.bank >= 0 ? half - u : u + half
      vertices.push(sample.x + l.x * u, GROUND_CLEARANCE + fromLow * tilt, sample.z + l.z * u)
    }
  }
  const row = ACROSS + 1
  for (let i = 0; i < pairs; i++) {
    const j = next(i)
    for (let a = 0; a < ACROSS; a++) {
      // Counter-clockwise seen from above, so the face normals point up.
      indices.push(i * row + a, i * row + a + 1, j * row + a, i * row + a + 1, j * row + a + 1, j * row + a)
    }
  }

  // Walls: per sample and side, a bottom vertex on the ground and a top vertex. Only the raised side has height.
  const wallBase = vertices.length / 3
  const tops: number[][] = [[], []] // [left, right] wall top height above the ground, per sample
  for (const sample of samples) {
    const l = leftOf(sample.heading)
    const raised = piece.roadWidth * Math.tan(Math.abs(sample.bank))
    const barrier = piece.bankAngle > 0 ? piece.barrierHeight * Math.min(1, Math.abs(sample.bank) / piece.bankAngle) : 0
    const high = GROUND_CLEARANCE + raised + barrier
    const leftHigh = sample.bank < 0
    for (const [side, sign] of [[0, 1], [1, -1]] as const) {
      const isHigh = side === 0 ? leftHigh : !leftHigh && sample.bank !== 0
      const top = isHigh ? high : GROUND_CLEARANCE
      tops[side]!.push(top)
      const ex = sample.x + l.x * half * sign
      const ez = sample.z + l.z * half * sign
      vertices.push(ex, 0, ez, ex, top, ez)
    }
  }
  const wallVertex = (i: number, side: number, top: 0 | 1) => wallBase + i * 4 + side * 2 + top
  for (let i = 0; i < pairs; i++) {
    const j = next(i)
    for (const side of [0, 1]) {
      if (Math.max(tops[side]![i]!, tops[side]![j]!) < GROUND_CLEARANCE + WALL_MIN_HEIGHT) continue
      const b0 = wallVertex(i, side, 0)
      const t0 = wallVertex(i, side, 1)
      const b1 = wallVertex(j, side, 0)
      const t1 = wallVertex(j, side, 1)
      indices.push(b0, b1, t0, t0, b1, t1)
    }
  }

  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }
}
