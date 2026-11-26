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

/** One piece of a banked path's centre line. */
export type PathSegment =
  /** `bank`: signed bank on this straight, radians. Positive = left edge low, as on a left arc. Default 0 (flat). */
  | { type: "straight"; length: number; bank?: number }
  /** `radius` is to the centre line. `angle` is how far it turns, radians (Math.PI = 180°). */
  | { type: "arc"; turn: "left" | "right"; radius: number; angle: number }

/**
 * A road along a centre line made of straights and arcs. Origin: the start of the centre line, facing +Z.
 * +X is the driver's left at the start. Arcs bank toward their centre: the inner edge stays on the ground and the
 * outer edge lifts. Straights are flat unless they set their own `bank`. The bank changes over `easeLength` at each
 * segment boundary.
 */
export type BankedPathPiece = PieceBase & {
  kind: "bankedPath"
  roadWidth: number
  segments: PathSegment[]
  /** Full bank on arcs, radians. */
  bankAngle: number
  /** Metres of road over which the bank changes, centred on each segment boundary. */
  easeLength: number
  /** Height (m) of a wall on the raised edge. Scales with the bank, so it is 0 where the road is flat. 0 = none. */
  barrierHeight: number
  /**
   * Openings in the barrier, so a ramp can meet the raised edge. `at` is the gap's centre, in metres along the centre
   * line from the start of the first segment. `side` is which edge.
   */
  barrierGaps?: Array<{ at: number; length: number; side: "left" | "right" }>
  /** The end joins the start. For an oval: the segments must bring the centre line back to the origin. */
  closed: boolean
  /** Centre-line samples per metre. More = smoother. */
  resolution: number
}

/** A straight wedge to drive up. Origin: centre of its low edge, on the ground. It rises toward +Z. */
export type RampPiece = PieceBase & {
  kind: "ramp"
  /** Along the rise (Z). */
  length: number
  /** Across (X). */
  width: number
  /** Height of the high edge. */
  height: number
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

export type TerrainPiece = BumpPiece | BankedPathPiece | RampPiece | RoughPatchPiece
export type TerrainLayout = TerrainPiece[]
