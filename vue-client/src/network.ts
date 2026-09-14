import { getTransport } from "@/shared/transport"
import { connectionStatus, myId, remotePlayers, serverCount, type PlayerSnapshot } from "@/store/network"

const MS_PER_UPDATE = 1000 / 30 // ~30 updates per second
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1000

interface PositionInput {
  x: number
  y: number
}

const networkBuffer: PositionInput[] = []
let clientSeq = 0
let lastCountSeq = -1
const lastPlayerSeq = new Map<string, number>()
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
        const msg = JSON.parse(new TextDecoder().decode(value))
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

function handleDatagram(msg: any) {
  if (!msg || typeof msg !== "object") return

  if (msg.type === "count") {
    if (typeof msg.seq === "number") {
      if (msg.seq <= lastCountSeq) return // drop duplicate or out-of-order count
      lastCountSeq = msg.seq
    }
    serverCount.value = msg.count
    return
  }

  if (msg.type === "pos") {
    if (typeof msg.id !== "string" || msg.id === myId.value) return // ignore own position
    upsertRemotePlayer(msg)
    return
  }

  if (msg.type === "leave" && typeof msg.id === "string") {
    delete remotePlayers.value[msg.id]
    lastPlayerSeq.delete(msg.id)
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

    const text = new TextDecoder().decode(merged)
    console.log("text :", text)
    if (!text) return

    const msg = JSON.parse(text)
    if (msg.type === "welcome") {
      console.log("Received welcome message:", msg)
      myId.value = msg.yourId
      return
    }

    if (msg.type === "state" && Array.isArray(msg.players)) {
      for (const player of msg.players) {
        if (player && typeof player.id === "string" && player.id !== myId.value) {
          upsertRemotePlayer(player)
        }
      }
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
      const update = networkBuffer.shift()
      if (!update) continue

      clientSeq++
      const payload = {
        type: "pos",
        seq: clientSeq,
        x: update.x,
        y: update.y,
      }

      try {
        await writer.write(new TextEncoder().encode(JSON.stringify(payload)))
      } catch (err) {
        console.error("Error sending datagram:", err)
        handleDisconnect()
        return
      }
    }

    setTimeout(loop, MS_PER_UPDATE)
  }

  void loop()
}

function upsertRemotePlayer(msg: { id: string; seq: unknown; x: unknown; y: unknown }) {
  if (!Number.isInteger(msg.seq) || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return

  const seq = Number(msg.seq)
  const x = Number(msg.x)
  const y = Number(msg.y)
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
  if (reconnectTimer || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

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

export function queueNetworkUpdate(update: PositionInput) {
  networkBuffer.push(update)
}

// Auto-start network on load
void initNetwork()

if (import.meta.hot) {
  import.meta.hot.accept()
}
