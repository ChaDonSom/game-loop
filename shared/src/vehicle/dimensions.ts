/**
 * The car's sizes, in metres. One source for physics (chassis, wheels), client meshes, and terrain sizing.
 * Plain data, so it can go into the world version hash and, later, over the wire.
 */
export type VehicleDimensions = {
  chassis: { width: number; height: number; length: number }
  /**
   * `width` is the tire width. Each wheel is one ray down; `rayOutward` places that ray across the tire: 0 = under
   * the hub (the tire's center), 1 = under the tire's outer edge. The client draws the tire at the hub.
   */
  wheel: { radius: number; width: number; suspensionRestLength: number; rayOutward: number }
}

export const VEHICLE_DIMENSIONS: VehicleDimensions = {
  chassis: { width: 1.2, height: 0.4, length: 2.4 },
  wheel: {
    radius: 0.3,
    width: 0.3,
    suspensionRestLength: 0.3,
    // YOUR CHOICE: where the wheel ray sits across the tire, 0 (center) to 1 (outer edge). Further out = wider
    // track: the car leans less and is harder to roll, and a bump under the outer part of the tire lifts it. Try it
    // on the banked oval and the bumps; `shared/src/rapier/wheels.ts` places the rays.
    rayOutward: 0.5,
  },
}
