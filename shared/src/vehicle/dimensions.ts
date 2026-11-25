/**
 * The car's sizes, in metres. One source for physics (chassis, wheels), client meshes, and terrain sizing.
 * Plain data, so it can go into the world version hash and, later, over the wire.
 */
export type VehicleDimensions = {
  chassis: { width: number; height: number; length: number }
  /**
   * `width` is the tire width. The physics does not use it: each wheel is one ray down from its hub.
   * The client mesh and the terrain sizes use it.
   */
  wheel: { radius: number; width: number; suspensionRestLength: number }
}

export const VEHICLE_DIMENSIONS: VehicleDimensions = {
  chassis: { width: 1.2, height: 0.4, length: 2.4 },
  wheel: { radius: 0.3, width: 0.15, suspensionRestLength: 0.3 },
}
