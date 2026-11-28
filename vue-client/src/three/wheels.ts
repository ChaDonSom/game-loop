import * as THREE from "three"
import { chassisAxes, dot, VEHICLE_DIMENSIONS } from "@game-loop/shared"

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }

/**
 * Wheel meshes with a pattern, so the eye can see how fast each wheel turns (issue 20): spin, lock under the brake,
 * wheelspin.
 *
 * One texture (an atlas) holds both faces: the left half is the sidewall (rim, spokes, one marker), the right half is
 * the tread. One material, so one draw call per wheel, the same as a plain black wheel.
 */

// ----------------------------------------------------
// #region MARK: Slots
// ----------------------------------------------------

// YOUR CHOICE: spokes on the rim. More spokes look busier and start to strobe at a lower speed (see `MARKER_COLOR`).
const SPOKES = 5
// YOUR CHOICE: one bright mark on the sidewall. Spokes repeat, so above ~25 mph (11 m/s) a 5-spoke rim can look still
// or backwards at 60 fps. The mark repeats only once per turn, so it reads true up to ~125 mph (56 m/s).
const MARKER_COLOR = "#f2c230"
// YOUR CHOICE: tread blocks around the tire. Seen from behind. N blocks look still or backwards above about
// 125/N mph at 60 fps (18 blocks: ~7 mph), so they show texture, not speed.
const TREAD_BLOCKS = 18
// YOUR CHOICE: groove color on the tread. Near RUBBER = subtle; lighter = the tread reads from the chase camera, and
// strobes more above the speed in TREAD_BLOCKS.
const TREAD_GROOVE = "#202020"
// YOUR CHOICE: bright bands across the tread, in MARKER_COLOR, in line with the sidewall marker. This is the speed cue
// from behind. N bands read true up to about 125/N mph at 60 fps (1 band: ~125 mph, 3 bands: ~42 mph). 0 = none.
const TREAD_MARKS = 1
// YOUR CHOICE: drawn tire width, as a multiple of the physics width (VEHICLE_DIMENSIONS.wheel.width, 0.15 m). Drawing
// only: the shared width also sizes the terrain bumps, so do not change it for looks.
const DRAWN_WIDTH_SCALE = 1
const RUBBER = "#151515"
const RIM = "#b9bec6"

/** Half the marker's angle round the wheel, rad. */
const MARKER_HALF_ANGLE = 0.2

/** Pixels per atlas half. 128 is sharp at chase-camera distance and costs 128 KB of GPU memory with mipmaps. */
const SIZE = 128

// ----------------------------------------------------
// #region MARK: Texture
// ----------------------------------------------------

function drawSidewall(context: CanvasRenderingContext2D) {
  const c = SIZE / 2
  const r = SIZE / 2
  context.fillStyle = RUBBER
  context.fillRect(0, 0, SIZE, SIZE)

  // Rim disk, spoke holes cut back to a dark color, then the hub.
  context.fillStyle = RIM
  context.beginPath()
  context.arc(c, c, r * 0.64, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = "#2a2d31"
  const holeWidth = (Math.PI * 2) / SPOKES - 0.42
  for (let i = 0; i < SPOKES; i++) {
    const start = (i / SPOKES) * Math.PI * 2 + 0.21
    context.beginPath()
    context.arc(c, c, r * 0.54, start, start + holeWidth)
    context.arc(c, c, r * 0.22, start + holeWidth, start, true)
    context.closePath()
    context.fill()
  }

  context.fillStyle = "#6d727a"
  context.beginPath()
  context.arc(c, c, r * 0.13, 0, Math.PI * 2)
  context.fill()

  // The marker: one block on the tire, out past the rim.
  context.fillStyle = MARKER_COLOR
  context.beginPath()
  context.arc(c, c, r * 0.92, -MARKER_HALF_ANGLE, MARKER_HALF_ANGLE)
  context.arc(c, c, r * 0.72, MARKER_HALF_ANGLE, -MARKER_HALF_ANGLE, true)
  context.closePath()
  context.fill()
}

function drawTread(context: CanvasRenderingContext2D) {
  context.fillStyle = RUBBER
  context.fillRect(SIZE, 0, SIZE, SIZE)
  context.fillStyle = TREAD_GROOVE
  const pitch = SIZE / TREAD_BLOCKS
  // Grooves across the tread (along u, which runs round the tire), with a gap at the center line.
  for (let i = 0; i < TREAD_BLOCKS; i++) {
    const x = SIZE + i * pitch
    context.fillRect(x, 6, pitch * 0.4, SIZE / 2 - 10)
    context.fillRect(x + pitch * 0.5, SIZE / 2 + 4, pitch * 0.4, SIZE / 2 - 10)
  }

  // Marks across the full tread. u = 0 is the sidewall marker's angle, so the first mark lines up with it. A mark at
  // u = 0 straddles the seam, so draw it at both ends of the tread half.
  context.fillStyle = MARKER_COLOR
  const markWidth = SIZE * MARKER_HALF_ANGLE / Math.PI
  for (let i = 0; i < TREAD_MARKS; i++) {
    const x = SIZE + (i / TREAD_MARKS) * SIZE
    if (i > 0) {
      context.fillRect(x - markWidth / 2, 0, markWidth, SIZE)
      continue
    }
    // Stay inside the tread half: the left half is the sidewall.
    context.fillRect(SIZE, 0, markWidth / 2, SIZE)
    context.fillRect(SIZE * 2 - markWidth / 2, 0, markWidth / 2, SIZE)
  }
}

function createWheelTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = SIZE * 2
  canvas.height = SIZE
  const context = canvas.getContext("2d")
  if (context) {
    drawSidewall(context)
    drawTread(context)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// ----------------------------------------------------
// #region MARK: Geometry
// ----------------------------------------------------

/**
 * A cylinder whose UVs point into the atlas: caps into the left half, the side into the right half. Axle along x.
 * A small inset keeps mipmaps from bleeding one half into the other.
 */
function createWheelGeometry(radius: number, width: number) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 24)
  const uv = geometry.getAttribute("uv")
  const normal = geometry.getAttribute("normal")
  const inset = 2 / (SIZE * 2)
  for (let i = 0; i < uv.count; i++) {
    // Caps have normals along ±y (the cylinder axis before the turn below); the side has normal.y = 0.
    const isCap = Math.abs(normal.getY(i)) > 0.5
    const u = uv.getX(i)
    uv.setX(i, isCap ? inset + u * (0.5 - 2 * inset) : 0.5 + inset + u * (0.5 - 2 * inset))
  }
  uv.needsUpdate = true
  // Single material: draw the whole geometry in one call.
  geometry.clearGroups()
  geometry.rotateZ(Math.PI / 2)
  return geometry
}

export default function initWheelMeshes(scene: THREE.Scene, radius: number) {
  const wheelGeometry = createWheelGeometry(radius, VEHICLE_DIMENSIONS.wheel.width * DRAWN_WIDTH_SCALE)
  const wheelMaterial = new THREE.MeshStandardMaterial({ map: createWheelTexture(), roughness: 0.85 })
  const wheelMeshes: THREE.Mesh[] = []

  for (let index = 0; index < 4; index++) {
    const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheelMesh.castShadow = true
    scene.add(wheelMesh)
    wheelMeshes.push(wheelMesh)
  }

  return wheelMeshes
}

// ----------------------------------------------------
// #region MARK: Pose
// ----------------------------------------------------

const yAxis = new THREE.Vector3(0, 1, 0)
const xAxis = new THREE.Vector3(1, 0, 0)
const tempSteer = new THREE.Quaternion()
const tempSpin = new THREE.Quaternion()

/**
 * Sets a wheel's rotation relative to the chassis: steer about y, then roll about the axle (x).
 * `spin` is in radians, same sign as Rapier's `wheelRotation`: it rises as the car rolls forward (local −z). A forward
 * roll moves the top of the wheel toward −z, which is a negative turn about +x, so the mesh turns by −spin.
 */
export function setWheelLocalRotation(target: THREE.Quaternion, steer: number, spin: number) {
  tempSteer.setFromAxisAngle(yAxis, steer)
  tempSpin.setFromAxisAngle(xAxis, -spin)
  return target.copy(tempSteer).multiply(tempSpin)
}

const tempWheelPos = new THREE.Vector3()
const tempLocal = new THREE.Quaternion()
/**
 * Moves the wheel meshes to their correct world coordinates based on the vehicle's current state and the drawn
 * chassis pose. Use the mesh pose, not the physics body: the mesh is the smoothed pose, and the wheels must match it.
 */
export function moveWheelMeshesToWorldCoordinates(
  vehicle: any,
  wheelMeshes: THREE.Mesh[],
  chassisMesh: THREE.Mesh,
  steering: number,
) {
  const tempChassisQuat = chassisMesh.quaternion
  for (let i = 0; i < vehicle.numWheels(); i++) {
    const wheelMesh = wheelMeshes[i]
    const connectionPoint = vehicle.wheelChassisConnectionPointCs(i)
    const suspensionLength = vehicle.wheelSuspensionLength(i)
    if (!wheelMesh || suspensionLength === null || connectionPoint === null) continue

    // Start at the suspension attachment point and move
    // down along the suspension direction.
    tempWheelPos.set(connectionPoint.x, connectionPoint.y - suspensionLength, connectionPoint.z)

    // Convert chassis-local position into world space.
    tempWheelPos.applyQuaternion(tempChassisQuat)
    tempWheelPos.add(chassisMesh.position)
    wheelMesh.position.copy(tempWheelPos)

    // Chassis orientation, then steer (front wheels only) and roll.
    setWheelLocalRotation(tempLocal, i < 2 ? steering : 0, vehicle.wheelRotation(i) ?? 0)
    wheelMesh.quaternion.copy(tempChassisQuat).multiply(tempLocal)
  }
}

/**
 * Roll rate for a car with no vehicle controller (a remote car), rad/s, in the sign of `wheelRotation`: positive
 * forward. Assumes the wheels roll with the ground: no lock or wheelspin, because the wire state does not carry wheel
 * spin. Forward speed uses the same rule as the drive code (`chassisAxes`).
 */
export function rollRate(linvel: Vec3, chassisQuat: Quat, radius: number) {
  return dot(chassisAxes(chassisQuat).forward, linvel) / radius
}
