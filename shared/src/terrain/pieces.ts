import RAPIER from "@dimforge/rapier3d-compat"
import { seededRandom } from "./random.js"
import type { BankedTurnPiece, BumpPiece, RoughPatchPiece, TerrainPiece } from "./types.js"

/**
 * Collider shapes for each piece, in the piece's own frame (origin on the ground, facing +Z).
 * `buildTerrainPhysics` places them in the world. The client builds each mesh from the collider itself,
 * so whatever shape you return here is also what you see.
 */
export function pieceColliders(piece: TerrainPiece): RAPIER.ColliderDesc[] {
  switch (piece.kind) {
    case "bump":
      return [bumpCollider(piece)]
    case "bankedTurn":
      return [bankedTurnCollider(piece)]
    case "roughPatch":
      return [roughPatchCollider(piece)]
  }
}

/** Lifts flat pieces just above the ground, so the wheel rays hit them first and they do not flicker. */
const GROUND_CLEARANCE = 0.01

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

/** Shape of a banked turn. Shared by the collider and (through it) the client mesh. */
export function bankedTurnGeometry(piece: BankedTurnPiece) {
  const across = 4 // vertices across the road, minus one
  const centerRadius = piece.innerRadius + piece.roadWidth / 2
  const vertices: number[] = []
  const indices: number[] = []

  for (let s = 0; s <= piece.segments; s++) {
    const theta = (s / piece.segments) * piece.arc
    // Tilt eases in and out at each end, so you can drive on and off from flat ground.
    const endDistance = Math.min(theta, piece.arc - theta)
    const ease = piece.easeArc > 0 ? Math.min(1, endDistance / piece.easeArc) : 1
    const tilt = Math.tan(piece.bankAngle * (ease * ease * (3 - 2 * ease)))
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)

    for (let a = 0; a <= across; a++) {
      const offset = (a / across) * piece.roadWidth // 0 at the inner edge
      const radius = piece.innerRadius + offset
      // Circle centre at (-centerRadius, 0): theta = 0 is the origin, heading +Z, bending toward -X.
      vertices.push(-centerRadius + radius * cos, GROUND_CLEARANCE + offset * tilt, radius * sin)
    }
  }

  const row = across + 1
  for (let s = 0; s < piece.segments; s++) {
    for (let a = 0; a < across; a++) {
      const i = s * row + a
      // Counter-clockwise seen from above, so the face normals point up.
      indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1)
    }
  }

  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) }
}

function bankedTurnCollider(piece: BankedTurnPiece): RAPIER.ColliderDesc {
  const { vertices, indices } = bankedTurnGeometry(piece)
  return RAPIER.ColliderDesc.trimesh(vertices, indices)
}
