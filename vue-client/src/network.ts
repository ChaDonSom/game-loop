import { getTransport } from "@/shared/transport"
import { connectionStatus, myId, remotePlayers, serverCount, type PlayerSnapshot } from "@/store/network"

const MS_PER_UPDATE = 50 // ~20 updates per second

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

export async function initNetwork() {
  if (initialized) return
  initialized = true
  if (import.meta.hot) import.meta.hot.data.initialized = true

  connectionStatus.value = "connecting"
  try {
    const transport = await getTransport()
    connectionStatus.value = "connected"

    startDatagramReader(transport)
    startStreamReader(transport)
    startNetLoop(transport)
  } catch (err) {
    connectionStatus.value = "disconnected"
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
    console.log("pos update")
    if (!msg.id || msg.id === myId.value) return // ignore own position

    const prevSeq = lastPlayerSeq.get(msg.id) ?? -1
    if (typeof msg.seq === "number") {
      if (msg.seq <= prevSeq) return // drop duplicate or out-of-order player update
      lastPlayerSeq.set(msg.id, msg.seq)
    }

    const snapshot: PlayerSnapshot = {
      x: msg.x,
      y: msg.y,
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
    if (!text) return

    const msg = JSON.parse(text)
    if (msg.type === "welcome") {
      console.log("Received welcome message:", msg)
      myId.value = msg.yourId
    }
  } catch (err) {
    console.error("Error reading incoming stream:", err)
  }
}

async function startNetLoop(transport: WebTransport) {
  const writer = transport.datagrams.writable.getWriter()

  async function loop() {
    while (networkBuffer.length > 0) {
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
      }
    }

    setTimeout(loop, MS_PER_UPDATE)
  }

  loop()
}

export function queueNetworkUpdate(update: PositionInput) {
  networkBuffer.push(update)
}

// Auto-start network on load
initNetwork()

if (import.meta.hot) {
  import.meta.hot.accept()
}
