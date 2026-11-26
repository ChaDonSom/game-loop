import RAPIER from "@dimforge/rapier3d-compat"
import {
  initRapier,
  ramp as initRamp,
  initGround,
  initWalls,
  initChassis,
  initWheels,
  Pad,
  Keys,
  handleSteeringAndDrive,
  buildTerrainPhysics,
  applySurfaceGrip,
  DEFAULT_WORLD,
  isSpawnClear,
  isStuckUpsideDown,
  flipUpright,
  resetDriveState,
  roundVehicleState,
  type VehicleStateMessage,
} from "@game-loop/shared"
import { clamp } from "@game-loop/shared"
import controls from "./controls.js"

/**
 * Just a container function for now to keep things clean; but may actually end up significantly more simplified or
 * something, depending on what all needs to be shared here, vs what all is specific to the server. Server needs to
 * share the entire physics world code with the clients. Server-only code will be the server loop, and the server
 * physics-world state broadcasts.
 * TODO: Finish implementing server-side physics loop and state broadcasting.
 */
export default async function initServerRapier(sendState: (message: VehicleStateMessage) => void) {
  // ----------------------------------------------------
  // #region MARK: 1. INITIALIZE RAPIER WASM & PHYSICS WORLD
  // ----------------------------------------------------
  const { world } = await initRapier()
  initRamp(world)
  initGround(world)
  initWalls(world)
  const terrain = buildTerrainPhysics(world, DEFAULT_WORLD.layout)

  const players = new Map<
    string,
    {
      chassis: ReturnType<typeof initChassis>
      vehicle: RAPIER.DynamicRayCastVehicleController
      steering: number
      spawnIndex: number
      /** Last `flip` count from this player's `controls` that the server acted on. */
      flipCount: number
    }
  >()
  const defaultControls = {
    seq: 0,
    keys: {},
    pad: { connected: false, steer: 0, throttle: 0, brake: 0 },
    flip: 0,
    t: Date.now(),
  }

  /**
   * YOUR CHOICE: how many spawn slots to try for a clear spot. Each row of 2 slots is 3 m further down the ramp
   * (`spawnPose` in `shared/src/rapier/chassis.ts`, ramp in `shared/src/rapier/ramp.ts`). Too many, and a new car can
   * start off the ramp.
   */
  const SPAWN_SLOTS_TO_TRY = 6

  /**
   * Lowest spawn slot that no connected player holds and no car sits on. A slot frees up when its player leaves. If no
   * slot in range is clear, the lowest slot no player holds, even if a car sits on it (the old rule).
   */
  function freeSpawnIndex() {
    const taken = new Set(Array.from(players.values(), (player) => player.spawnIndex))
    for (let index = 0; index < SPAWN_SLOTS_TO_TRY; index++) {
      if (!taken.has(index) && isSpawnClear(world, index)) return index
    }
    let index = 0
    while (taken.has(index)) index++
    return index
  }

  /** Adds a player's car and returns its spawn slot. The client needs the slot to start its car at the same pose. */
  function addPlayer(id: string) {
    const existing = players.get(id)
    if (existing) return existing.spawnIndex

    const spawnIndex = freeSpawnIndex()
    const chassis = initChassis(world, spawnIndex)
    const vehicle = world.createVehicleController(chassis.body)
    initWheels(chassis, vehicle)
    players.set(id, { chassis, vehicle, steering: 0, spawnIndex, flipCount: 0 })
    return spawnIndex
  }

  function removePlayer(id: string) {
    const player = players.get(id)
    if (!player) return

    world.removeVehicleController(player.vehicle)
    world.removeRigidBody(player.chassis.body)
    players.delete(id)
    delete controls[id]
  }

  // ----------------------------------------------------
  // #region MARK: 6. SERVER PHYSICS LOOP
  // ----------------------------------------------------

  function update() {
    for (const [id, player] of players) {
      const currentControls = controls[id] ?? defaultControls
      // A new press flips the car only if it is stuck here too. The client runs the same rule in the same step.
      const flipCount = currentControls.flip ?? 0
      if (flipCount > player.flipCount) {
        player.flipCount = flipCount
        if (isStuckUpsideDown(player.chassis.body) && flipUpright(world, player.chassis.body)) {
          resetDriveState(player.vehicle)
        }
      }
      player.steering = handleSteeringAndDrive(
        1 / 60,
        player.chassis.body,
        currentControls.pad,
        currentControls.keys,
        player.vehicle,
      ).steering
      applySurfaceGrip(player.vehicle, terrain, DEFAULT_WORLD.surfaceGrip)
      player.vehicle.updateVehicle(1 / 60)
    }

    world.step()
  }

  function broadcastState() {
    const now = Date.now()
    sendState({
      type: "state",
      seq: ++stateSeq,
      players: Array.from(players, ([id, player]) => {
        const position = player.chassis.body.translation()
        const rotation = player.chassis.body.rotation()
        const velocity = player.chassis.body.linvel()
        const angularVelocity = player.chassis.body.angvel()
        const playerControls = controls[id]
        return roundVehicleState({
          id,
          ack: playerControls?.seq ?? 0,
          ackAgeMs: playerControls ? Math.max(0, now - playerControls.t) : 0,
          position: { x: position.x, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
          velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
          steering: player.steering,
        })
      }),
      t: now,
    })
  }

  let stateSeq = 0

  // Fixed timestep. Node truncates `setInterval(fn, 1000 / 60)` to 16 ms (62.5 Hz), so one physics step per callback
  // made the server simulation run faster than the clients' 60 Hz. Step by elapsed time instead.
  const fixedDtMs = 1000 / 60
  const maxStepsPerTick = 5
  let lastTickTime = performance.now()
  let accumulatorMs = 0
  setInterval(() => {
    const now = performance.now()
    accumulatorMs += now - lastTickTime
    lastTickTime = now

    let steps = 0
    while (accumulatorMs >= fixedDtMs && steps < maxStepsPerTick) {
      update()
      accumulatorMs -= fixedDtMs
      steps++
    }
    // After a long stall, drop the backlog instead of fast-forwarding the world.
    if (steps === maxStepsPerTick) accumulatorMs = 0
  }, 4)
  setInterval(broadcastState, 1000 / 30)

  return { addPlayer, removePlayer }
}
