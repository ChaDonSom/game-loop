import { closeTransport, getTransport } from "@/shared/transport"
import {
  authoritativePlayers,
  connectionStatus,
  myId,
  mySpawnIndex,
  playerCount,
  remotePlayers,
  serverCount,
  worldMismatch,
  type PlayerSnapshot,
} from "@/store/network"
import {
  decodeMessage,
  encodeMessage,
  isServerDatagramMessage,
  isServerStreamMessage,
  type ClientMessage,
  type Pad,
  type PositionBroadcastMessage,
  type ServerDatagramMessage,
  type VehicleStateMessage,
  WORLD_VERSION,
} from "@game-loop/shared"
import { handleWorldMismatch } from "@/worldMismatch"
import { Roster } from "@/roster"
import keys from "@/input/keys"

const MS_PER_UPDATE = 1000 / 30 // ~30 updates per second
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1000

interface PositionInput {
  x: number
  y: number
}

interface ControlsInput {
  keys: typeof keys
  pad: Pad
  /** Flip presses this session. See `ClientControlsMessage`. */
  flip: number
}

const networkBuffer: PositionInput[] = []
let latestControls: ControlsInput | null = null
let clientSeq = 0
let lastCountSeq = -1
/** Last `state` seq per vehicle id. One tick can come in several parts with the same seq. */
const lastVehicleSeq = new Map<string, number>()
const lastPlayerSeq = new Map<string, number>()
const roster = new Roster()
/** Send time (performance.now) of recent `controls` datagrams, by seq. Used to measure round-trip time. */
const controlsSentAt = new Map<number, number>()
const MAX_TRACKED_CONTROLS = 120
// survives HMR reloads so we don't re-lock the transport's streams a second time
let initialized = import.meta.hot?.data.initialized ?? false
let reconnectAttempts = import.meta.hot?.data.reconnectAttempts ?? 0
let reconnectTimer = import.meta.hot?.data.reconnectTimer ?? null

export async function initNetwork() {
  if (initialized) return

  initialized = true
  syncHotState()
  connectionStatus.value = "connecting"

  try {
    const transport = await getTransport()
    // A new connection can be to a restarted server, whose `rosterSeq` starts again from 0.
    resetRoster()
    connectionStatus.value = "connected"
    reconnectAttempts = 0
    syncHotState()

    transport.closed.finally(() => {
      handleDisconnect()
    })

    void startDatagramReader(transport)
    void startStreamReader(transport)
    startNetLoop(transport)
  } catch (err) {
    connectionStatus.value = "disconnected"
    initialized = false
    syncHotState()
    scheduleReconnect()
    console.error("Failed to connect transport:", err)
  }
}

async function startDatagramReader(transport: WebTransport) {
  const reader = transport.datagrams.readable.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      try {
        const msg = decodeMessage(value)
        if (!isServerDatagramMessage(msg)) {
          console.warn("Dropped malformed datagram:", msg)
          continue
        }
        handleDatagram(msg)
      } catch (err) {
        console.error("Invalid datagram packet:", err)
      }
    }
  } catch (err) {
    console.error("Datagram reader error:", err)
  } finally {
    reader.releaseLock()
  }
}

function handleDatagram(msg: ServerDatagramMessage) {
  switch (msg.type) {
    case "count":
      if (msg.seq <= lastCountSeq) return // drop duplicate or out-of-order count
      lastCountSeq = msg.seq
      serverCount.value = msg.count
      return
    case "pos":
      if (msg.id === myId.value) return // ignore own position
      upsertRemotePlayer(msg)
      return
    case "state":
      upsertAuthoritativePlayers(msg)
      return
  }
}

async function startStreamReader(transport: WebTransport) {
  const reader = transport.incomingUnidirectionalStreams.getReader()
  try {
    while (true) {
      const { done, value: stream } = await reader.read()
      if (done) break
      handleIncomingStream(stream)
    }
  } catch (err) {
    console.error("Stream reader error:", err)
  } finally {
    reader.releaseLock()
  }
}

async function handleIncomingStream(stream: ReadableStream<Uint8Array>) {
  try {
    console.log("Handling incoming stream")
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
    const merged = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    if (merged.length === 0) return

    const msg = decodeMessage(merged)
    if (!isServerStreamMessage(msg)) {
      console.warn("Dropped malformed stream message:", msg)
      return
    }

    switch (msg.type) {
      case "welcome":
        console.log("Received welcome message:", msg)
        myId.value = msg.yourId
        mySpawnIndex.value = msg.spawnIndex
        roster.applySnapshot(msg.players ?? [msg.yourId], msg.rosterSeq ?? 0)
        syncRoster()
        if (msg.worldVersion !== WORLD_VERSION) {
          handleWorldMismatch(msg.worldVersion ?? null)
          // Leave the server. It then removes this player's car, so no stale input keeps driving it.
          closeTransport()
        }
        return
      case "state":
        for (const player of msg.players) {
          if (player.id !== myId.value) upsertRemotePlayer(player)
        }
        return
      case "join":
      case "leave":
        if (roster.apply(msg.id, msg.type === "join", msg.rosterSeq)) syncRoster()
        return
    }
  } catch (err) {
    console.error("Error reading incoming stream:", err)
  }
}

async function startNetLoop(transport: WebTransport) {
  const writer = transport.datagrams.writable.getWriter()
  let closed = false

  transport.closed.finally(() => {
    closed = true
    writer.releaseLock()
  })

  async function loop() {
    if (closed) return

    while (networkBuffer.length > 0 && !closed) {
      const networkUpdate = networkBuffer.shift()
      if (!networkUpdate) continue

      clientSeq++
      const payload: ClientMessage = {
        type: "pos",
        seq: clientSeq,
        x: networkUpdate.x,
        y: networkUpdate.y,
      }

      try {
        await writer.write(encodeMessage(payload))
      } catch (err) {
        console.error("Error sending datagram:", err)
        handleDisconnect()
        return
      }
    }

    if (latestControls && !closed && !worldMismatch.value) {
      clientSeq++
      controlsSentAt.set(clientSeq, performance.now())
      if (controlsSentAt.size > MAX_TRACKED_CONTROLS) {
        const oldestSeq = controlsSentAt.keys().next().value
        if (oldestSeq !== undefined) controlsSentAt.delete(oldestSeq)
      }
      try {
        await writer.write(
          encodeMessage({
            type: "controls",
            seq: clientSeq,
            keys: latestControls.keys,
            pad: latestControls.pad,
            flip: latestControls.flip,
          }),
        )
      } catch (err) {
        console.error("Error sending controls:", err)
        handleDisconnect()
        return
      }
    }

    setTimeout(loop, MS_PER_UPDATE)
  }

  void loop()
}

function upsertRemotePlayer(msg: Pick<PositionBroadcastMessage, "id" | "seq" | "x" | "y">) {
  const { seq, x, y } = msg
  const prevSeq = lastPlayerSeq.get(msg.id) ?? -1
  if (seq <= prevSeq) return // drop duplicate or out-of-order player update
  lastPlayerSeq.set(msg.id, seq)

  const snapshot: PlayerSnapshot = {
    x,
    y,
    time: performance.now(),
  }

  let history = remotePlayers.value[msg.id]
  if (!history) {
    history = []
    remotePlayers.value[msg.id] = history
  }

  history.push(snapshot)

  // keep history bounded to recent snapshots
  if (history.length > 20) {
    history.splice(0, history.length - 20)
  }
}

/**
 * Merges one `state` part. A vehicle entry counts only if it is newer than that vehicle's last one, and only while the
 * roster has the player: a late datagram after a `leave` must not bring the car back.
 */
function upsertAuthoritativePlayers(msg: VehicleStateMessage) {
  const time = performance.now()
  for (const player of msg.players) {
    if (!roster.has(player.id)) continue
    if (msg.seq <= (lastVehicleSeq.get(player.id) ?? -1)) continue // drop duplicate or out-of-order state
    lastVehicleSeq.set(player.id, msg.seq)
    authoritativePlayers.value[player.id] = { ...player, seq: msg.seq, time }
  }
}

/** Drops every player the roster no longer has, and updates the count. */
function syncRoster() {
  playerCount.value = roster.size
  for (const id of Object.keys(authoritativePlayers.value)) {
    if (!roster.has(id)) delete authoritativePlayers.value[id]
  }
  for (const id of Object.keys(remotePlayers.value)) {
    if (!roster.has(id)) delete remotePlayers.value[id]
  }
  for (const id of lastVehicleSeq.keys()) if (!roster.has(id)) lastVehicleSeq.delete(id)
  for (const id of lastPlayerSeq.keys()) if (!roster.has(id)) lastPlayerSeq.delete(id)
}

function resetRoster() {
  roster.clear()
  playerCount.value = null
  authoritativePlayers.value = {}
  remotePlayers.value = {}
  lastVehicleSeq.clear()
  lastPlayerSeq.clear()
}

function handleDisconnect() {
  if (connectionStatus.value !== "disconnected") {
    connectionStatus.value = "disconnected"
  }
  if (!initialized) return

  initialized = false
  syncHotState()
  scheduleReconnect()
}

function scheduleReconnect() {
  // A world mismatch is not a network fault: reconnecting would join the wrong world again.
  if (worldMismatch.value || reconnectTimer || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

  reconnectAttempts += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    syncHotState()
    void initNetwork()
  }, RECONNECT_DELAY_MS * reconnectAttempts)
  syncHotState()
}

function syncHotState() {
  if (!import.meta.hot) return
  import.meta.hot.data.initialized = initialized
  import.meta.hot.data.reconnectAttempts = reconnectAttempts
  import.meta.hot.data.reconnectTimer = reconnectTimer
}

/**
 * How far a server state lags this client's prediction, in seconds. The server state at time T shows the inputs the
 * client sent one uplink delay before T. So the lag is the full send-to-now time of `ack`, minus the time the server
 * held `ack` before it took the snapshot (`ackAgeMs`). That is one round trip plus the local wait before processing.
 * `null` if the seq is unknown.
 */
export function stateLagSeconds(ack: number, ackAgeMs: number): number | null {
  const sentAt = controlsSentAt.get(ack)
  if (sentAt === undefined) return null
  return Math.max(0, performance.now() - sentAt - ackAgeMs) / 1000
}

/**
 * Seq of the last datagram this client sent. A `controls` queued now goes out with a higher seq, so a server state with
 * `ack` at or below this value does not show it yet.
 */
export function lastSentSeq() {
  return clientSeq
}

export function queueNetworkUpdate(update: PositionInput) {
  networkBuffer.push(update)
}

export function queueControls(update: ControlsInput) {
  latestControls = {
    keys: { ...update.keys },
    pad: { ...update.pad },
    flip: update.flip,
  }
}

// Auto-start network on load
void initNetwork()

// Close on page hide (reload, tab close). Then the server sees the close at once, and removes this car for everyone.
// Without it, the server can wait for the connection's idle timeout, and the old car stays on the road until then.
window.addEventListener("pagehide", closeTransport)

if (import.meta.hot) {
  import.meta.hot.accept()
}
