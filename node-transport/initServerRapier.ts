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
export default async function initServerRapier(broadcastDatagram: (data: any) => void) {
  // ----------------------------------------------------
  // #region MARK: 1. INITIALIZE RAPIER WASM & PHYSICS WORLD
  // ----------------------------------------------------
  const { world } = await initRapier()
  initRamp(world)
  initGround(world)
  initWalls(world)

  const players = new Map<
    string,
    { chassis: ReturnType<typeof initChassis>; vehicle: RAPIER.DynamicRayCastVehicleController; steering: number }
  >()
  let nextSpawnIndex = 0
  const defaultControls = { seq: 0, keys: {}, pad: { connected: false, steer: 0, throttle: 0, brake: 0 }, t: Date.now() }

  function addPlayer(id: string) {
    if (players.has(id)) return

    const chassis = initChassis(world, nextSpawnIndex++)
    const vehicle = world.createVehicleController(chassis.body)
    initWheels(chassis, vehicle)
    players.set(id, { chassis, vehicle, steering: 0 })
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
      player.steering = handleSteeringAndDrive(
        1 / 60,
        player.chassis.body,
        currentControls.pad,
        currentControls.keys,
        player.vehicle,
      ).steering
      player.vehicle.updateVehicle(1 / 60)
    }

    world.step()
  }

  function broadcastState() {
    broadcastDatagram({
      type: "state",
      seq: ++stateSeq,
      players: Array.from(players, ([id, player]) => {
        const position = player.chassis.body.translation()
        const rotation = player.chassis.body.rotation()
        const velocity = player.chassis.body.linvel()
        return {
          id,
          ack: controls[id]?.seq ?? 0,
          position: { x: position.x, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
          velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          steering: player.steering,
        }
      }),
      t: Date.now(),
    })
  }

  let stateSeq = 0
  setInterval(update, 1000 / 60)
  setInterval(broadcastState, 1000 / 30)

  return { addPlayer, removePlayer }
}
