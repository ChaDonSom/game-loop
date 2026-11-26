import RAPIER from "@dimforge/rapier3d-compat"
import { seededRandom } from "./random.js"
import { GROUND_CLEARANCE, bankedPathGeometry } from "./bankedPath.js"
import type { BankedPathPiece, BumpPiece, RampPiece, RoughPatchPiece, TerrainPiece } from "./types.js"

/**
 * Collider shapes for each piece, in the piece's own frame (origin on the ground, facing +Z).
 * `buildTerrainPhysics` places them in the world. The client builds each mesh from the collider itself,
 * so whatever shape you return here is also what you see.
 */
export function pieceColliders(piece: TerrainPiece): RAPIER.ColliderDesc[] {
  switch (piece.kind) {
    case "bump":
      return [bumpCollider(piece)]
    case "bankedPath":
      return [bankedPathCollider(piece)]
    case "ramp":
      return [rampCollider(piece)]
    case "roughPatch":
      return [roughPatchCollider(piece)]
  }
}

// 90 degrees (PI / 2) around the Z-axis: sin(PI/4) ≈ 0.7071, cos(PI/4) ≈ 0.7071
const rotZ90 = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }

function bumpCollider(piece: BumpPiece): RAPIER.ColliderDesc {
  // A round-topped bump: a cylinder lying across the road (axis along X), sunk into the ground so only
  // an arc sticks out. Its footprint on the ground is piece.length along the road, and its top is at piece.height.
  // Circle through the two ground edges (±length/2, 0) and the top (0, height):
  const halfLength = piece.length / 2
  const radius = (halfLength * halfLength + piece.height * piece.height) / (2 * piece.height)
  return RAPIER.ColliderDesc.cylinder(piece.width / 2, radius)
    .setTranslation(0, piece.height - radius, 0)
    .setRotation(rotZ90)
}

/**
 * A heightfield over a sizeX × sizeZ area, centred on the piece origin.
 * `heightAt(x, z)` gives the height at each grid point, in the piece frame.
 * Rapier stores rows along Z and columns along X: heights[row + col * (nrows + 1)].
 */
export function gridHeightfield(
  sizeX: number,
  sizeZ: number,
  cellSize: number,
  heightAt: (x: number, z: number) => number,
): RAPIER.ColliderDesc {
  const nrows = Math.max(1, Math.round(sizeZ / cellSize))
  const ncols = Math.max(1, Math.round(sizeX / cellSize))
  const heights = new Float32Array((nrows + 1) * (ncols + 1))
  for (let col = 0; col <= ncols; col++) {
    const x = -sizeX / 2 + (col * sizeX) / ncols
    for (let row = 0; row <= nrows; row++) {
      const z = -sizeZ / 2 + (row * sizeZ) / nrows
      heights[row + col * (nrows + 1)] = heightAt(x, z)
    }
  }
  return RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, { x: sizeX, y: 1, z: sizeZ })
}

function roughPatchCollider(piece: RoughPatchPiece): RAPIER.ColliderDesc {
  const random = seededRandom(piece.seed)
  // A few overlapping waves in random directions. Smooth enough to drive, uneven enough to feel.
  const waves = Array.from({ length: 6 }, () => {
    const angle = random() * Math.PI * 2
    return {
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      wavelength: 1.5 + random() * 6,
      phase: random() * Math.PI * 2,
    }
  })
  const taper = Math.min(3, piece.sizeX / 4, piece.sizeZ / 4)

  return gridHeightfield(piece.sizeX, piece.sizeZ, piece.cellSize, (x, z) => {
    let sum = 0
    for (const wave of waves) {
      sum += Math.sin(((x * wave.dirX + z * wave.dirZ) / wave.wavelength) * Math.PI * 2 + wave.phase)
    }
    const normalized = (sum / waves.length + 1) / 2 // 0..1
    // Fade to ground level at the edges, so there is no step to drive over.
    const edge = Math.min(piece.sizeX / 2 - Math.abs(x), piece.sizeZ / 2 - Math.abs(z))
    const fade = Math.min(1, Math.max(0, edge / taper))
    return GROUND_CLEARANCE + normalized * piece.heightRange * fade
  })
}

function bankedPathCollider(piece: BankedPathPiece): RAPIER.ColliderDesc {
  const { vertices, indices } = bankedPathGeometry(piece)
  return RAPIER.ColliderDesc.trimesh(vertices, indices)
}

/** Shape of a ramp: a closed wedge, low edge at z = 0 on the ground, high edge at z = length. */
export function rampGeometry(piece: RampPiece) {
  const w = piece.width / 2
  const { length: l, height: h } = piece
  // 0-1: low edge, 2-3: high edge top, 4-5: high edge bottom.
  // prettier-ignore
  const vertices = new Float32Array([
    -w, GROUND_CLEARANCE, 0,  w, GROUND_CLEARANCE, 0,
    -w, h, l,                 w, h, l,
    -w, 0, l,                 w, 0, l,
  ])
  // Slope (normal up and back), back wall (normal +Z), two side triangles. Counter-clockwise seen from outside.
  // prettier-ignore
  const indices = new Uint32Array([
    0, 2, 1,  1, 2, 3,
    2, 4, 3,  3, 4, 5,
    0, 4, 2,  1, 3, 5,
  ])
  return { vertices, indices }
}

function rampCollider(piece: RampPiece): RAPIER.ColliderDesc {
  const { vertices, indices } = rampGeometry(piece)
  return RAPIER.ColliderDesc.trimesh(vertices, indices)
}
