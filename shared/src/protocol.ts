/**
 * Wire protocol between `node-transport` (server) and `vue-client` (browser).
 *
 * Every message is a JSON object with a `type` field, UTF-8 encoded. Both sides import the types, validators, and
 * codec from this file so the message shapes live in one place. Change a shape here and the compiler shows every
 * sender and receiver that must follow.
 *
 * Channels:
 * - Datagrams (unreliable, unordered): client -> server `pos` / `controls`; server -> client `count`, `pos`,
 *   `state`. Each sender stamps a `seq` so the receiver can drop duplicates and stale packets. Use a datagram only for
 *   data that a later packet repeats: a lost one then does not matter.
 * - Unidirectional streams (reliable): server -> client `welcome`, `join`, `leave`, and the initial `state` snapshot
 *   of other players. One stream per message, so two messages have no order between them (see `rosterSeq`).
 */
import type { Keys, Pad } from "./controls/types.js"

/**
 * Raise on any change that an old client or server cannot read. It goes into `WORLD_VERSION` (see `world.ts`), so a
 * stale tab gets the version notice instead of a half-working protocol.
 * 2: `state` in parts, `join` and `leave` on streams, `controls.flip`.
 */
export const PROTOCOL_VERSION = 2

// ----------------------------------------------------
// #region MARK: Shared value shapes
// ----------------------------------------------------

export type Vector3 = { x: number; y: number; z: number }
export type Quaternion = { x: number; y: number; z: number; w: number }

/** Last 2D position a client reported for itself. */
export type PositionSnapshot = { seq: number; x: number; y: number; t: number }

/** Server-authoritative physics state of one player's vehicle. */
export type VehicleState = {
  id: string
  /**
   * Last client `controls` seq that a server physics step applied for this player (not just received). So a state
   * with `ack >= N` includes input N. Used for client reconciliation.
   */
  ack: number
  /**
   * Milliseconds from the server receiving `ack` to taking this snapshot. The client subtracts it from its
   * send-to-now time for `ack`, so it knows how far this snapshot lags its own prediction.
   */
  ackAgeMs: number
  position: Vector3
  rotation: Quaternion
  velocity: Vector3
  /** Angular velocity in rad/s, world frame. The client needs it to follow the server car's spin in the air. */
  angularVelocity: Vector3
  steering: number
}

// ----------------------------------------------------
// #region MARK: Client -> server messages (datagrams)
// ----------------------------------------------------

export type ClientPositionMessage = { type: "pos"; seq: number; x: number; y: number }
/**
 * `flip`: count of flip presses. It rides in every `controls`, so a lost datagram does not lose a press. The server
 * treats any change of the count as a press (it drops out-of-order datagrams), and flips the car if it is stuck
 * (`tryFlip`). So the count never needs a reset. Missing = 0.
 */
export type ClientControlsMessage = { type: "controls"; seq: number; keys: Keys; pad: Pad; flip?: number }
export type ClientMessage = ClientPositionMessage | ClientControlsMessage

// ----------------------------------------------------
// #region MARK: Server -> client messages
// ----------------------------------------------------

/**
 * Stream. Tells a new client its assigned id and spawn slot (see `spawnPose`).
 * `worldVersion`: hash of the server's world data (see `world.ts`). Missing from servers older than the check,
 * so the client treats a missing value as a mismatch.
 * `players`: ids connected now, this client included, as of `rosterSeq`. Missing from older servers.
 */
export type WelcomeMessage = {
  type: "welcome"
  yourId: string
  spawnIndex: number
  worldVersion?: string
  players?: string[]
  rosterSeq?: number
}
/**
 * Stream. A player connected (`join`) or disconnected (`leave`). Reliable: no later packet repeats a one-time event.
 * `rosterSeq`: one server counter, up by 1 on each join or leave. Streams have no order between them, so a `leave` can
 * arrive before the `join` of the same id. The client keeps the last `rosterSeq` per id and ignores older events.
 */
export type RosterMessage = { type: "join" | "leave"; id: string; rosterSeq: number }
/** Stream. Last known positions of the players already connected when a client joins. */
export type InitialPositionsMessage = { type: "state"; players: Array<{ id: string } & PositionSnapshot> }
/** Datagram. Once-per-second heartbeat. */
export type CountMessage = { type: "count"; seq: number; count: number; t: number }
/** Datagram. Relays one client's reported position to the other clients. */
export type PositionBroadcastMessage = { type: "pos"; id: string } & PositionSnapshot
/**
 * Datagram. Authoritative physics state of vehicles, sent at the server broadcast rate. One tick can come in several
 * parts (see `packVehicleStates`), all with the same `seq`, so the receiver checks `seq` per vehicle id.
 */
export type VehicleStateMessage = { type: "state"; seq: number; players: VehicleState[]; t: number }

export type ServerStreamMessage = WelcomeMessage | InitialPositionsMessage | RosterMessage
export type ServerDatagramMessage = CountMessage | PositionBroadcastMessage | VehicleStateMessage

// ----------------------------------------------------
// #region MARK: Codec
// ----------------------------------------------------

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeMessage(message: ClientMessage | ServerStreamMessage | ServerDatagramMessage): Uint8Array {
  return encoder.encode(JSON.stringify(message))
}

/**
 * Size budget for one datagram when the session does not report one, in bytes. Chromium reported 1211 for this server.
 */
export const FALLBACK_MAX_DATAGRAM_BYTES = 1100

/**
 * Encodes one tick of vehicle states as one or more `state` datagrams, each at most `maxBytes` long. Rounds each state
 * for the wire first (`roundVehicleState`). All parts keep the same `seq`. A vehicle never splits, so a part always
 * holds at least one vehicle, even if that one is too big.
 *
 * Builds the JSON text by hand, with the same key order as `encodeMessage`, so each vehicle is encoded once. The text
 * is ASCII (UUID ids, numbers), so its length in characters is its length in bytes.
 */
export function packVehicleStates(players: VehicleState[], seq: number, t: number, maxBytes: number): Uint8Array[] {
  const head = `{"type":"state","seq":${seq},"players":[`
  const tail = `],"t":${t}}`
  const parts: Uint8Array[] = []
  let entries: string[] = []
  let length = head.length + tail.length
  for (const player of players) {
    const entry = JSON.stringify(roundVehicleState(player))
    // Every entry but the first adds a comma.
    if (entries.length > 0 && length + 1 + entry.length > maxBytes) {
      parts.push(encoder.encode(head + entries.join(",") + tail))
      entries = []
      length = head.length + tail.length
    }
    length += (entries.length > 0 ? 1 : 0) + entry.length
    entries.push(entry)
  }
  if (entries.length > 0) parts.push(encoder.encode(head + entries.join(",") + tail))
  return parts
}

/**
 * YOUR CHOICE: decimals kept on the wire. Fewer decimals: smaller packets, more cars per packet, less precision.
 * Look at `reconcile.ts` dead zones (`POSITION_DEAD_ZONE`, `ROTATION_DEAD_ZONE`) for the precision the client needs,
 * and at the M3 table in the plan for bytes per car.
 */
const POSITION_DECIMALS = 3
const VELOCITY_DECIMALS = 3
const ROTATION_DECIMALS = 4
const SPIN_DECIMALS = 4
const STEERING_DECIMALS = 4

function round(value: number, decimals: number) {
  const scale = 10 ** decimals
  return Math.round(value * scale) / scale
}

function roundVector3(v: Vector3, decimals: number): Vector3 {
  return { x: round(v.x, decimals), y: round(v.y, decimals), z: round(v.z, decimals) }
}

/**
 * Rounds a vehicle state for the wire, into plain objects (Rapier vectors in, JSON-ready objects out). The shape stays
 * the same. The rotation can be off unit length by ~1e-4.
 */
export function roundVehicleState(state: VehicleState): VehicleState {
  const q = state.rotation
  return {
    id: state.id,
    ack: state.ack,
    ackAgeMs: state.ackAgeMs,
    position: roundVector3(state.position, POSITION_DECIMALS),
    rotation: {
      x: round(q.x, ROTATION_DECIMALS),
      y: round(q.y, ROTATION_DECIMALS),
      z: round(q.z, ROTATION_DECIMALS),
      w: round(q.w, ROTATION_DECIMALS),
    },
    velocity: roundVector3(state.velocity, VELOCITY_DECIMALS),
    angularVelocity: roundVector3(state.angularVelocity, SPIN_DECIMALS),
    steering: round(state.steering, STEERING_DECIMALS),
  }
}

/** Parses a packet. Returns `unknown`: run a validator before you trust the shape. Throws on invalid JSON. */
export function decodeMessage(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes))
}

// ----------------------------------------------------
// #region MARK: Validators (incoming data is untrusted)
// ----------------------------------------------------

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isVector3(value: unknown): value is Vector3 {
  return isObject(value) && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
}

export function isQuaternion(value: unknown): value is Quaternion {
  return isVector3(value) && Number.isFinite((value as Record<string, unknown>).w)
}

export function isClientPositionMessage(msg: unknown): msg is ClientPositionMessage {
  return (
    isObject(msg) && msg.type === "pos" && Number.isInteger(msg.seq) && Number.isFinite(msg.x) && Number.isFinite(msg.y)
  )
}

export function isClientControlsMessage(msg: unknown): msg is ClientControlsMessage {
  return (
    isObject(msg) &&
    msg.type === "controls" &&
    Number.isInteger(msg.seq) &&
    isObject(msg.keys) &&
    Object.values(msg.keys).every((value) => typeof value === "boolean") &&
    isObject(msg.pad) &&
    typeof msg.pad.connected === "boolean" &&
    Number.isFinite(msg.pad.steer) &&
    Number.isFinite(msg.pad.throttle) &&
    Number.isFinite(msg.pad.brake) &&
    (msg.pad.reverse === undefined || typeof msg.pad.reverse === "boolean") &&
    (msg.flip === undefined || (Number.isInteger(msg.flip) && msg.flip >= 0))
  )
}

function isPositionSnapshot(value: unknown): value is PositionSnapshot {
  return (
    isObject(value) &&
    Number.isInteger(value.seq) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.t)
  )
}

function isVehicleState(value: unknown): value is VehicleState {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    Number.isInteger(value.ack) &&
    Number.isFinite(value.ackAgeMs) &&
    value.ackAgeMs >= 0 &&
    isVector3(value.position) &&
    isQuaternion(value.rotation) &&
    isVector3(value.velocity) &&
    isVector3(value.angularVelocity) &&
    Number.isFinite(value.steering)
  )
}

/** Validates a packet received on a server -> client unidirectional stream. */
export function isServerStreamMessage(msg: unknown): msg is ServerStreamMessage {
  if (!isObject(msg)) return false
  switch (msg.type) {
    case "welcome":
      return (
        typeof msg.yourId === "string" &&
        Number.isInteger(msg.spawnIndex) &&
        msg.spawnIndex >= 0 &&
        (msg.worldVersion === undefined || typeof msg.worldVersion === "string") &&
        (msg.players === undefined ||
          (Array.isArray(msg.players) && msg.players.every((id: unknown) => typeof id === "string"))) &&
        (msg.rosterSeq === undefined || (Number.isInteger(msg.rosterSeq) && msg.rosterSeq >= 0))
      )
    case "join":
    case "leave":
      return typeof msg.id === "string" && Number.isInteger(msg.rosterSeq) && msg.rosterSeq >= 0
    case "state":
      return (
        Array.isArray(msg.players) &&
        msg.players.every((player: unknown) => isPositionSnapshot(player) && typeof (player as any).id === "string")
      )
    default:
      return false
  }
}

/**
 * Validates a server -> client datagram. Rejects the whole packet if any part is malformed, so a bad packet never
 * advances a receiver's seq or partly updates its state.
 */
export function isServerDatagramMessage(msg: unknown): msg is ServerDatagramMessage {
  if (!isObject(msg)) return false
  switch (msg.type) {
    case "count":
      return Number.isInteger(msg.seq) && Number.isFinite(msg.count) && Number.isFinite(msg.t)
    case "pos":
      return typeof msg.id === "string" && isPositionSnapshot(msg)
    case "state":
      return (
        Number.isInteger(msg.seq) &&
        Number.isFinite(msg.t) &&
        Array.isArray(msg.players) &&
        msg.players.every(isVehicleState)
      )
    default:
      return false
  }
}
