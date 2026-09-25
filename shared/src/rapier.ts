import RAPIER from "@dimforge/rapier3d-compat"

/**
 * Shared logic between server and client. Used for server running the game room / physics, and for client to run it
 * as well for its optimistic updates, that it can cross-check against the authoritative server state.
 *
 * Note: without the server, e.g. if the connection drops, the client can still run the physics locally.
 */

export async function initRapier() {
  await RAPIER.init()

  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0)
  const world = new RAPIER.World(gravity)

  return {
    world,
    gravity,
  }
}
