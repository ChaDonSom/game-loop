import * as THREE from "three"
import RAPIER from "@dimforge/rapier3d-compat"
import type { TerrainPhysics, TerrainPiece } from "@game-loop/shared"

/**
 * Builds a mesh from each terrain collider. The collider is the single source: change a shape in
 * `shared/src/terrain/pieces.ts` and the mesh follows. No sizes are repeated here.
 */
export default function buildTerrainMeshes(scene: THREE.Scene, terrain: TerrainPhysics) {
  const meshes: THREE.Mesh[] = []

  for (const { piece, colliders } of terrain.pieces) {
    // Flat shading shows each grid cell, so uneven ground reads as uneven from a distance.
    const material = new THREE.MeshStandardMaterial({
      color: pieceColor(piece),
      roughness: 0.85,
      flatShading: true,
      // A banked path's skirt and barrier are single sheets. Draw both faces, so you see them from either side.
      side: piece.kind === "bankedPath" ? THREE.DoubleSide : THREE.FrontSide,
      // Flat road sits 1 cm above the ground. Pull it forward in depth, so it does not flicker against the ground far away.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    for (const collider of colliders) {
      const geometry = geometryFromShape(collider.shape)
      if (!geometry) {
        console.warn(`No mesh for collider shape type ${collider.shape.type} (piece ${piece.id})`)
        continue
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(collider.translation())
      mesh.quaternion.copy(collider.rotation())
      mesh.castShadow = piece.kind === "bump"
      // Draw terrain before the ground under it: the GPU then skips the ground's hidden pixels (early depth test).
      mesh.renderOrder = -1
      mesh.receiveShadow = true
      scene.add(mesh)
      meshes.push(mesh)
    }
  }

  return {
    meshes,
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      meshes.length = 0
    },
  }
}

function pieceColor(piece: TerrainPiece) {
  if (piece.kind === "bump") return 0xe8c547
  return piece.surface === "dirt" ? 0x8b6a43 : 0x5a5f66
}

/** Three.js geometry for a Rapier shape, in the collider's own frame. */
function geometryFromShape(shape: RAPIER.Shape): THREE.BufferGeometry | null {
  switch (shape.type) {
    case RAPIER.ShapeType.Cuboid: {
      const { x, y, z } = (shape as RAPIER.Cuboid).halfExtents
      return new THREE.BoxGeometry(x * 2, y * 2, z * 2)
    }
    case RAPIER.ShapeType.RoundCuboid: {
      const s = shape as RAPIER.RoundCuboid
      const r = s.borderRadius
      return new THREE.BoxGeometry((s.halfExtents.x + r) * 2, (s.halfExtents.y + r) * 2, (s.halfExtents.z + r) * 2)
    }
    case RAPIER.ShapeType.Ball:
      return new THREE.SphereGeometry((shape as RAPIER.Ball).radius, 24, 16)
    case RAPIER.ShapeType.Capsule: {
      const s = shape as RAPIER.Capsule
      return new THREE.CapsuleGeometry(s.radius, s.halfHeight * 2, 8, 24)
    }
    case RAPIER.ShapeType.Cylinder: {
      const s = shape as RAPIER.Cylinder
      return new THREE.CylinderGeometry(s.radius, s.radius, s.halfHeight * 2, 32)
    }
    case RAPIER.ShapeType.RoundCylinder: {
      // Close enough to see: the rounded edge is drawn square.
      const s = shape as RAPIER.RoundCylinder
      const r = s.radius + s.borderRadius
      return new THREE.CylinderGeometry(r, r, (s.halfHeight + s.borderRadius) * 2, 32)
    }
    case RAPIER.ShapeType.Cone: {
      const s = shape as RAPIER.Cone
      return new THREE.ConeGeometry(s.radius, s.halfHeight * 2, 32)
    }
    case RAPIER.ShapeType.TriMesh: {
      const s = shape as RAPIER.TriMesh
      return indexedGeometry(s.vertices, s.indices)
    }
    case RAPIER.ShapeType.HeightField:
      return heightfieldGeometry(shape as RAPIER.Heightfield)
    default:
      return null
  }
}

function indexedGeometry(vertices: Float32Array, indices: Uint32Array) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1))
  geometry.computeVertexNormals()
  return geometry
}

/** Same grid as `gridHeightfield` in shared: rows along Z, columns along X, heights[row + col * (nrows + 1)]. */
function heightfieldGeometry(shape: RAPIER.Heightfield) {
  const { nrows, ncols, heights, scale } = shape
  const vertices = new Float32Array((nrows + 1) * (ncols + 1) * 3)
  for (let col = 0; col <= ncols; col++) {
    for (let row = 0; row <= nrows; row++) {
      const i = row + col * (nrows + 1)
      vertices[i * 3] = -scale.x / 2 + (col * scale.x) / ncols
      vertices[i * 3 + 1] = (heights[i] ?? 0) * scale.y
      vertices[i * 3 + 2] = -scale.z / 2 + (row * scale.z) / nrows
    }
  }
  const indices: number[] = []
  for (let col = 0; col < ncols; col++) {
    for (let row = 0; row < nrows; row++) {
      const i = row + col * (nrows + 1)
      const right = i + (nrows + 1)
      // Counter-clockwise seen from above.
      indices.push(i, i + 1, right, right, i + 1, right + 1)
    }
  }
  return indexedGeometry(vertices, new Uint32Array(indices))
}
