/**
 * Wire protocol between `node-transport` (server) and `vue-client` (browser).
 *
 * Every message is a JSON object with a `type` field, UTF-8 encoded. Both sides import the types, validators, and
 * codec from this file so the message shapes live in one place. Change a shape here and the compiler shows every
 * sender and receiver that must follow.
 *
 * Channels:
 * - Datagrams (unreliable, unordered): client -> server `pos` / `controls`; server -> client `count`, `pos`,
 *   `state`, `leave`. Each sender stamps a `seq` so the receiver can drop duplicates and stale packets.
 * - Unidirectional streams (reliable): server -> client `welcome` and the initial `state` snapshot of other players.
 */
import type { Keys, Pad } from "./controls/types.js"

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
  /** Last client `controls` seq the server applied for this player. Used for client reconciliation. */
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
export type ClientControlsMessage = { type: "controls"; seq: number; keys: Keys; pad: Pad }
export type ClientMessage = ClientPositionMessage | ClientControlsMessage

// ----------------------------------------------------
// #region MARK: Server -> client messages
// ----------------------------------------------------

/**
 * Stream. Tells a new client its assigned id and spawn slot (see `spawnPose`).
 * `worldVersion`: hash of the server's world data (see `world.ts`). Missing from servers older than the check,
 * so the client treats a missing value as a mismatch.
 */
export type WelcomeMessage = { type: "welcome"; yourId: string; spawnIndex: number; worldVersion?: string }
/** Stream. Last known positions of the players already connected when a client joins. */
export type InitialPositionsMessage = { type: "state"; players: Array<{ id: string } & PositionSnapshot> }
/** Datagram. Once-per-second heartbeat. */
export type CountMessage = { type: "count"; seq: number; count: number; t: number }
/** Datagram. Relays one client's reported position to the other clients. */
export type PositionBroadcastMessage = { type: "pos"; id: string } & PositionSnapshot
/** Datagram. Authoritative physics state for all vehicles, sent at the server broadcast rate. */
export type VehicleStateMessage = { type: "state"; seq: number; players: VehicleState[]; t: number }
/** Datagram. A player disconnected. */
export type LeaveMessage = { type: "leave"; id: string }

export type ServerStreamMessage = WelcomeMessage | InitialPositionsMessage
export type ServerDatagramMessage = CountMessage | PositionBroadcastMessage | VehicleStateMessage | LeaveMessage

// ----------------------------------------------------
// #region MARK: Codec
// ----------------------------------------------------

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeMessage(message: ClientMessage | ServerStreamMessage | ServerDatagramMessage): Uint8Array {
  return encoder.encode(JSON.stringify(message))
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
    Number.isFinite(msg.pad.brake)
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
        (msg.worldVersion === undefined || typeof msg.worldVersion === "string")
      )
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
    case "leave":
      return typeof msg.id === "string"
    default:
      return false
  }
}
