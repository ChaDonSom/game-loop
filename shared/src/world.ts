import { DEFAULT_TERRAIN_LAYOUT } from "./terrain/layout.js"
import { DEFAULT_SURFACE_GRIP, type SurfaceGrip } from "./terrain/surfaces.js"
import type { TerrainLayout } from "./terrain/types.js"
import { VEHICLE_DIMENSIONS, type VehicleDimensions } from "./vehicle/dimensions.js"

/** Every shared simulation input that is data. Server and client must hold the same values. */
export type WorldConfig = {
  layout: TerrainLayout
  surfaceGrip: SurfaceGrip
  vehicle: VehicleDimensions
}

export const DEFAULT_WORLD: WorldConfig = {
  layout: DEFAULT_TERRAIN_LAYOUT,
  surfaceGrip: DEFAULT_SURFACE_GRIP,
  vehicle: VEHICLE_DIMENSIONS,
}

/** JSON with object keys sorted, so the same data always gives the same text. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value)
}

/**
 * Short hash (FNV-1a, 32-bit) of the world data. Any data edit changes it. Builder code changes do not.
 * The server sends it in `welcome`. The client compares it with its own.
 */
export function computeWorldVersion(config: WorldConfig): string {
  const text = canonicalJson(config)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export const WORLD_VERSION = computeWorldVersion(DEFAULT_WORLD)
