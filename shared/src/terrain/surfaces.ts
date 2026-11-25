import type { Surface } from "./types.js"

/** Wheel `frictionSlip` for each surface. Higher = more grip. */
export type SurfaceGrip = Record<Surface, number>

export const DEFAULT_SURFACE_GRIP: SurfaceGrip = {
  // Same as the starting value in rapier/wheels.ts, so road driving does not change.
  road: 5.0,
  // YOUR CHOICE: dirt grip. Compare with road on the rough patch. Placeholder: same as road (no difference yet).
  dirt: 2.5,
}
