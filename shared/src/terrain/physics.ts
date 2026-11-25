import RAPIER from "@dimforge/rapier3d-compat"
import { pieceColliders } from "./pieces.js"
import type { SurfaceGrip } from "./surfaces.js"
import type { Surface, TerrainLayout, TerrainPiece } from "./types.js"

export type TerrainPhysics = {
  pieces: Array<{ piece: TerrainPiece; body: RAPIER.RigidBody; colliders: RAPIER.Collider[] }>
  /** Surface under a collider. Colliders that are not terrain (ramp, ground) count as road. */
  surfaceOf(collider: RAPIER.Collider | null): Surface
  /** Remove every body and collider this terrain made. Then the world can rebuild from new data. */
  dispose(): void
}

/** Build the terrain colliders from layout data. Server and client both call this with the same layout. */
export function buildTerrainPhysics(world: RAPIER.World, layout: TerrainLayout): TerrainPhysics {
  const surfaceByHandle = new Map<number, Surface>()

  const pieces = layout.map((piece) => {
    const half = piece.rotationY / 2
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(piece.position.x, piece.position.y, piece.position.z)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
    )
    const colliders = pieceColliders(piece).map((desc) => {
      const collider = world.createCollider(desc, body)
      surfaceByHandle.set(collider.handle, piece.surface)
      return collider
    })
    return { piece, body, colliders }
  })

  return {
    pieces,
    surfaceOf: (collider) => (collider ? (surfaceByHandle.get(collider.handle) ?? "road") : "road"),
    dispose() {
      for (const { body } of pieces) world.removeRigidBody(body)
      pieces.length = 0
      surfaceByHandle.clear()
    },
  }
}

/**
 * Set each wheel's grip from the surface under it. Call every physics step, before `vehicle.updateVehicle`.
 * Server and client both call it, so client prediction matches the server.
 */
export function applySurfaceGrip(
  vehicle: RAPIER.DynamicRayCastVehicleController,
  terrain: TerrainPhysics,
  grip: SurfaceGrip,
) {
  for (let i = 0; i < vehicle.numWheels(); i++) {
    vehicle.setWheelFrictionSlip(i, grip[terrain.surfaceOf(vehicle.wheelGroundObject(i))])
  }
}
