import type { Vector3 } from "../protocol.js"

/** What a wheel drives on. Sets that wheel's grip (see `surfaces.ts`). */
export type Surface = "road" | "dirt"

type PieceBase = {
  /** Unique within a layout. */
  id: string
  surface: Surface
  /** Where the piece's origin sits in the world. y = 0 is the ground surface. */
  position: Vector3
  /** Turn about +Y, in radians. 0 means the piece faces +Z. */
  rotationY: number
}

/** A speed bump. Origin: centre of its footprint, on the ground. */
export type BumpPiece = PieceBase & {
  kind: "bump"
  /** Along the road (Z). */
  length: number
  /** Across the road (X). */
  width: number
  height: number
  /** For a varied (heightfield) bump shape. Same seed, same shape, on server and client. */
  seed: number
}

/**
 * A turn with a tilted road. Origin: the start of the road's centre line, facing +Z.
 * The turn bends toward -X. The outer edge is the raised edge.
 */
export type BankedTurnPiece = PieceBase & {
  kind: "bankedTurn"
  /** Radius of the inner road edge. */
  innerRadius: number
  roadWidth: number
  /** Full tilt, in radians. */
  bankAngle: number
  /** How far the turn goes round, in radians. Math.PI = 180°. */
  arc: number
  /** Arc, in radians, at each end where the tilt eases from 0 to full. Lets you drive on and off. */
  easeArc: number
  /** Number of steps along the arc. More = smoother. */
  segments: number
}

/** Uneven off-road ground. Origin: centre of the patch, on the ground. */
export type RoughPatchPiece = PieceBase & {
  kind: "roughPatch"
  sizeX: number
  sizeZ: number
  /** Highest point above the ground. */
  heightRange: number
  /** Grid spacing. Smaller = finer detail. */
  cellSize: number
  /** Same seed, same heights, on server and client. */
  seed: number
}

export type TerrainPiece = BumpPiece | BankedTurnPiece | RoughPatchPiece
export type TerrainLayout = TerrainPiece[]
