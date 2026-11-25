import { VEHICLE_DIMENSIONS } from "../vehicle/dimensions.js"
import type { BankedTurnPiece, BumpPiece, RoughPatchPiece, TerrainLayout } from "./types.js"

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
// Length is along the road, width is across it.
const bumpLength = 3 * tire.width
const bumpHeight = 0.75 * tire.width
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
// Banked turn: shape and placement
// ---------------------------------------------------------------------------
// YOUR CHOICE: how steep and how tight. Try car lengths for the radius.
const bankAngleDegrees = 15
const turnInnerRadius = 6 * car.length
const turnRoadWidth = 6 * car.width
// YOUR CHOICE: where it starts. Its entry faces +Z, centred on this point.
const turnEntry = { x: 0, z: 140 }

const bankedTurn: BankedTurnPiece = {
  kind: "bankedTurn",
  id: "banked-turn",
  surface: "road",
  position: { x: turnEntry.x, y: 0, z: turnEntry.z },
  rotationY: 0,
  innerRadius: turnInnerRadius,
  roadWidth: turnRoadWidth,
  bankAngle: (bankAngleDegrees * Math.PI) / 180,
  arc: Math.PI,
  easeArc: Math.PI / 6,
  segments: 48,
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

export const DEFAULT_TERRAIN_LAYOUT: TerrainLayout = [...bumps, bankedTurn, roughPatch]
