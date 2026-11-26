import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"
import type { BankedPathPiece, BumpPiece, RoughPatchPiece, TerrainLayout } from "./types.js"

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
const bumpLength = 4.33 * tire.width
const bumpHeight = 1.25 * tire.width
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
/** Height of the wall on the raised edge, m. Fades with the bank, so straights stay open. 0 = no wall. */
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
// Each straight must be longer than easeLength, so its middle is flat: that is where you drive on and off.
const ovalRadius = 50 // to the centre line
const ovalStraight = 100
const ovalBankDegrees = 20
const ovalRoadWidth = 10 * car.width

// Placement (not a slot): behind the spawn ramp, centred on x = 0, z = -260. Region x -200…200, z -480…-40.
// Turned 90°, so its straights run along X and the side facing the spawn is a flat straight: the way in shows.
const ovalCenter = { x: 0, z: -260 }
const ovalTurn = Math.PI / 2
// In the oval's own frame the path starts at (-radius, -straight/2) from its centre, heading +Z, turning left.
const ovalStart = { x: -ovalRadius, z: -ovalStraight / 2 }
const oval: BankedPathPiece = {
  kind: "bankedPath",
  id: "banked-oval",
  surface: "road",
  // The same start point, turned by ovalTurn about +Y into the world.
  position: {
    x: ovalCenter.x + ovalStart.x * Math.cos(ovalTurn) + ovalStart.z * Math.sin(ovalTurn),
    y: 0,
    z: ovalCenter.z - ovalStart.x * Math.sin(ovalTurn) + ovalStart.z * Math.cos(ovalTurn),
  },
  rotationY: ovalTurn,
  roadWidth: ovalRoadWidth,
  segments: [
    { type: "straight", length: ovalStraight },
    { type: "arc", turn: "left", radius: ovalRadius, angle: Math.PI },
    { type: "straight", length: ovalStraight },
    { type: "arc", turn: "left", radius: ovalRadius, angle: Math.PI },
  ],
  bankAngle: ovalBankDegrees * DEG,
  easeLength,
  barrierHeight,
  closed: true,
  resolution: pathResolution,
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

export const DEFAULT_TERRAIN_LAYOUT: TerrainLayout = [...bumps, bankedTurn, roughPatch, oval, sCurve]
