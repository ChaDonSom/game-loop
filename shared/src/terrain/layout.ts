import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"
import type { BankedPathPiece, BumpPiece, RampPiece, RoughPatchPiece, TerrainLayout } from "./types.js"

/**
 * The terrain both sides build. Plain data only: no functions, no Math.random().
 * Each block below keeps one piece's size, spacing, and placement together.
 *
 * Orientation: the car rolls off the spawn ramp near (0, 0, 5), heading +Z. +X is to the car's left.
 */

const tire = VEHICLE_DIMENSIONS.wheel
const car = VEHICLE_DIMENSIONS.chassis

// ---------------------------------------------------------------------------
// Bumps: size, spacing, placement
// ---------------------------------------------------------------------------
// YOUR CHOICE: bump size, as multiples of the car (tire.width, tire.radius, car.width ...).
// Length is the footprint along the road, width is across it, height is how far the top sticks up.
// Same sizes as before the tire width doubled (0.15 m to 0.30 m): 4.33 and 1.25 tire widths of 0.15 m = half a radius.
const bumpLength = 2.165 * tire.radius
const bumpHeight = 0.625 * tire.radius
const bumpWidth = 4 * car.width
// YOUR CHOICE: how many, how far apart, and where the row starts.
const bumpCount = 10
const bumpGap = 6
const bumpStart = { x: 0, z: 30 }

const bumps: BumpPiece[] = Array.from({ length: bumpCount }, (_, i) => ({
  kind: "bump",
  id: `bump-${i}`,
  surface: "road",
  position: { x: bumpStart.x, y: 0, z: bumpStart.z + i * bumpGap },
  rotationY: 0,
  length: bumpLength,
  width: bumpWidth,
  height: bumpHeight,
  seed: 1000 + i,
}))

// ---------------------------------------------------------------------------
// Banked roads: shared settings
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180
// YOUR CHOICE: metres of road over which the bank changes (arc to straight, or one bank to the other).
// Today's turn had about 9.4 m (30° of arc). Too short: a jolt. Too long: the arc is not banked when you need it.
const easeLength = 19
/** Height of the wall on the raised edge, m. Scales with the bank: 0 on flat road, in full at the full bank. 0 = none. */
const barrierHeight = 1
/** Centre-line samples per metre. */
const pathResolution = 1

// ---------------------------------------------------------------------------
// Banked turn (the first one): shape and placement
// ---------------------------------------------------------------------------
// YOUR CHOICE: how steep and how tight. Try car lengths for the radius.
const bankAngleDegrees = 15
const turnInnerRadius = 6 * car.length
const turnRoadWidth = 6 * car.width
// YOUR CHOICE: where it starts. Its entry faces +Z, centred on this point.
const turnEntry = { x: 0, z: 140 }

const bankedTurn: BankedPathPiece = {
  kind: "bankedPath",
  id: "banked-turn",
  surface: "road",
  position: { x: turnEntry.x, y: 0, z: turnEntry.z },
  rotationY: 0,
  roadWidth: turnRoadWidth,
  segments: [{ type: "arc", turn: "right", radius: turnInnerRadius + turnRoadWidth / 2, angle: Math.PI }],
  bankAngle: bankAngleDegrees * DEG,
  easeLength,
  barrierHeight,
  closed: false,
  resolution: pathResolution,
}

// ---------------------------------------------------------------------------
// Banked oval: size and bank
// ---------------------------------------------------------------------------
// YOUR CHOICE: the oval. No-friction speed of a banked curve: v = √(g · r · tan θ) in m/s (× 2.237 for mph).
// Pick the speed you want to hold, then the radius or the angle. Top speed is 94 mph (42 m/s).
const ovalRadius = 50 // to the centre line
const ovalStraight = 100
const ovalBankDegrees = 20
const ovalRoadWidth = 10 * car.width
// YOUR CHOICE: the straights' bank, and how slowly it changes. Asked for: half the turns' bank, with about a third
// of each straight in transition. The ease is centred on each straight-to-arc boundary, so a third of the straight
// (a sixth at each end) means an ease of straight / 3, counted half on the straight and half on the arc.
const ovalStraightBankDegrees = ovalBankDegrees / 2
const ovalEaseLength = ovalStraight / 3
// YOUR CHOICE: the entry ramp, up to the outer edge of the straight that faces the spawn. Its top meets the edge
// height (road width × tan(straight bank)). Longer = gentler.
const ovalRampLength = 15
const ovalRampWidth = 8

// Placement (not a slot): behind the spawn ramp, centred on x = 0, z = -260. Region x -200…200, z -480…-40.
// Turned 90°, so its straights run along X and the straight with the entry ramp faces the spawn: the way in shows.
const ovalCenter = { x: 0, z: -260 }
const ovalTurn = Math.PI / 2
// In the oval's own frame the path starts at (-radius, -straight/2) from its centre, heading +Z, turning left, so
// the first straight runs along local +Z at x = -radius, and its outer edge is at x = -radius - roadWidth / 2.
/** A point in the oval's own frame (origin at its centre), turned by ovalTurn about +Y into the world. */
function ovalToWorld(x: number, z: number) {
  return {
    x: ovalCenter.x + x * Math.cos(ovalTurn) + z * Math.sin(ovalTurn),
    y: 0,
    z: ovalCenter.z - x * Math.sin(ovalTurn) + z * Math.cos(ovalTurn),
  }
}
const ovalStraightBank = ovalStraightBankDegrees * DEG
const oval: BankedPathPiece = {
  kind: "bankedPath",
  id: "banked-oval",
  surface: "road",
  position: ovalToWorld(-ovalRadius, -ovalStraight / 2),
  rotationY: ovalTurn,
  roadWidth: ovalRoadWidth,
  segments: [
    { type: "straight", length: ovalStraight, bank: ovalStraightBank },
    { type: "arc", turn: "left", radius: ovalRadius, angle: Math.PI },
    { type: "straight", length: ovalStraight, bank: ovalStraightBank },
    { type: "arc", turn: "left", radius: ovalRadius, angle: Math.PI },
  ],
  bankAngle: ovalBankDegrees * DEG,
  easeLength: ovalEaseLength,
  barrierHeight,
  // The ramp meets the outer (right-hand) edge at the middle of the first straight.
  barrierGaps: [{ at: ovalStraight / 2, length: ovalRampWidth + 2, side: "right" }],
  closed: true,
  resolution: pathResolution,
}

/** Entry ramp: rises from outside the oval toward its centre, onto the outer edge of the first straight. */
const ovalRamp: RampPiece = {
  kind: "ramp",
  id: "banked-oval-ramp",
  surface: "road",
  position: ovalToWorld(-ovalRadius - ovalRoadWidth / 2 - ovalRampLength, 0),
  // Rises toward the oval's local +X (its inside), then turned with the oval.
  rotationY: ovalTurn + Math.PI / 2,
  length: ovalRampLength,
  width: ovalRampWidth,
  height: ovalRoadWidth * Math.tan(ovalStraightBank),
}

// ---------------------------------------------------------------------------
// Banked S curve: size and bank
// ---------------------------------------------------------------------------
// YOUR CHOICE: each arc's radius and angle, the straight between them, and the bank.
// The bank flips sides between the arcs. A longer middle straight gives the flip more room.
const sRadius = 40 // to the centre line
const sArcDegrees = 90
const sMiddleStraight = 10
const sBankDegrees = 15
const sRoadWidth = 6 * car.width

// Placement (not a slot): left of the bump row. Region x 60…400, z 60…480.
const sCurve: BankedPathPiece = {
  kind: "bankedPath",
  id: "banked-s-curve",
  surface: "road",
  position: { x: 100, y: 0, z: 100 },
  rotationY: 0,
  roadWidth: sRoadWidth,
  segments: [
    { type: "arc", turn: "left", radius: sRadius, angle: sArcDegrees * DEG },
    { type: "straight", length: sMiddleStraight },
    { type: "arc", turn: "right", radius: sRadius, angle: sArcDegrees * DEG },
  ],
  bankAngle: sBankDegrees * DEG,
  easeLength,
  barrierHeight,
  closed: false,
  resolution: pathResolution,
}

// ---------------------------------------------------------------------------
// Rough patch: roughness and placement
// ---------------------------------------------------------------------------
// YOUR CHOICE: how rough. Height range and grid detail, against the wheel size.
const roughHeightRange = 0.75 * tire.radius
const roughCellSize = 0.5
// YOUR CHOICE: where it sits and how big. Off to one side, so you choose to drive into it.
const roughCenter = { x: 30, z: 30 }
const roughSize = { x: 30, z: 30 }

const roughPatch: RoughPatchPiece = {
  kind: "roughPatch",
  id: "rough-patch",
  surface: "dirt",
  position: { x: roughCenter.x, y: 0, z: roughCenter.z },
  rotationY: 0,
  sizeX: roughSize.x,
  sizeZ: roughSize.z,
  heightRange: roughHeightRange,
  cellSize: roughCellSize,
  seed: 42,
}

export const DEFAULT_TERRAIN_LAYOUT: TerrainLayout = [...bumps, bankedTurn, roughPatch, oval, ovalRamp, sCurve]
