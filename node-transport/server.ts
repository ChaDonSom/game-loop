import "dotenv/config"
import { Http3Server } from "@fails-components/webtransport"
import { readFileSync } from "fs"
import ensureLocalCert from "./ensureLocalCert.js"
import crypto from "crypto"
import initServerRapier from "./initServerRapier.js"
import controls from "./controls.js"

const CERT_PATH = process.env.CERT_PATH ?? ""
const PRIV_KEY_PATH = process.env.PRIV_KEY_PATH ?? ""
const WT_SECRET = process.env.WT_SECRET ?? ""
const WT_PORT = Number(process.env.WT_PORT ?? "4433")

if (!Number.isInteger(WT_PORT) || WT_PORT < 1 || WT_PORT > 65535) {
  throw new Error("WT_PORT must be an integer between 1 and 65535")
}

ensureLocalCert()

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
})

if (!WT_SECRET) {
  throw new Error("WT_SECRET is required")
}

const server = new Http3Server({
  port: WT_PORT,
  host: "0.0.0.0",
  secret: WT_SECRET,
  cert: process.env.CERT_PATH ? readFileSync(CERT_PATH) : undefined,
  privKey: process.env.PRIV_KEY_PATH ? readFileSync(PRIV_KEY_PATH) : undefined,
})
const activeSessions = new Map()
const playerSnapshots = new Map<string, { seq: number; x: number; y: number; t: number }>()

const sessionStream = server.sessionStream("/wt")
server.startServer()
await server.ready
console.log(`HTTP/3 listening on 0.0.0.0:${WT_PORT} - waiting for WebTransport sessions...`)
const simulation = await initServerRapier(broadcastDatagram)
;(async () => {
  const reader = sessionStream.getReader()

  while (true) {
    const { done, value: session } = await reader.read()
    if (done) {
      console.log("client disconnected")
      break
    }
    handleSession(session)
  }
})().catch((err) => console.error("Session loop crashed:", err))

async function handleSession(session: {
  ready: Promise<void>
  visitorId?: string
  datagrams: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
  closed: Promise<void>
  createUnidirectionalStream: () => Promise<WritableStream<Uint8Array>>
}) {
  await session.ready
  console.log("client connected")

  const visitorId = crypto.randomUUID()
  session.visitorId = visitorId
  activeSessions.set(visitorId, session)
  simulation.addPlayer(visitorId)

  sendJsonMessage(session, { type: "welcome", yourId: visitorId }).catch((err) => {
    console.error("Failed to send welcome packet:", err)
  })

  const existingPlayers = Array.from(playerSnapshots.entries())
    .filter(([id]) => id !== visitorId)
    .map(([id, snapshot]) => ({ id, ...snapshot }))
  if (existingPlayers.length > 0) {
    sendJsonMessage(session, { type: "state", players: existingPlayers }).catch((err) => {
      console.error("Failed to send state packet:", err)
    })
  }

  let lastClientSeq = -1
  ;(async () => {
    const reader = session.datagrams.readable.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      try {
        const msg = JSON.parse(new TextDecoder().decode(value))
        if (!isValidMessage(msg) || msg.seq <= lastClientSeq) continue
        lastClientSeq = msg.seq

        if (isValidPositionMessage(msg)) {
          const snapshot = { seq: msg.seq, x: msg.x, y: msg.y, t: Date.now() }
          playerSnapshots.set(visitorId, snapshot)
          broadcastDatagram({ type: "pos", id: visitorId, ...snapshot }, visitorId)
          continue
        }

        if (!isValidControlsMessage(msg)) continue
        controls[visitorId] = {
          seq: msg.seq,
          keys: msg.keys,
          pad: msg.pad,
          t: Date.now(),
        }
      } catch (e) {
        console.error("Error processing client datagram:", e)
      }
    }
  })().catch(() => {})

  let count = 0
  const interval = setInterval(() => {
    count++
    const payload = new TextEncoder().encode(JSON.stringify({ type: "count", seq: count, count, t: Date.now() }))
    const writer = session.datagrams.writable.getWriter()
    writer.write(payload).catch(() => {}) // drop silently if it fails, this is the point for unreliable datagrams
    writer.releaseLock()
  }, 1000)

  const cleanup = () => {
    clearInterval(interval)
    if (session.visitorId) {
      activeSessions.delete(session.visitorId)
      simulation.removePlayer(session.visitorId)
      playerSnapshots.delete(session.visitorId)
      broadcastDatagram({ type: "leave", id: session.visitorId })
    }
  }

  session.closed.then(cleanup).catch(cleanup)
}

function isValidMessage(msg: any): msg is { type: "controls" | "pos"; seq: number } {
  return (msg?.type === "controls" || msg?.type === "pos") && Number.isInteger(msg.seq)
}

function isValidPositionMessage(msg: any): msg is { type: "pos"; seq: number; x: number; y: number } {
  return msg?.type === "pos" && Number.isFinite(msg.x) && Number.isFinite(msg.y)
}

function isValidControlsMessage(msg: any): msg is {
  type: "controls"
  seq: number
  keys: Record<string, boolean>
  pad: { connected: boolean; steer: number; throttle: number; brake: number }
} {
  return (
    msg?.type === "controls" &&
    Number.isInteger(msg.seq) &&
    typeof msg.keys === "object" &&
    msg.keys !== null &&
    !Array.isArray(msg.keys) &&
    Object.values(msg.keys).every((value) => typeof value === "boolean") &&
    typeof msg.pad === "object" &&
    msg.pad !== null &&
    typeof msg.pad.connected === "boolean" &&
    Number.isFinite(msg.pad.steer) &&
    Number.isFinite(msg.pad.throttle) &&
    Number.isFinite(msg.pad.brake)
  )
}

function broadcastDatagram(messageObj: Record<string, unknown>, excludedVisitorId?: string) {
  const payload = new TextEncoder().encode(JSON.stringify(messageObj))
  for (const [id, s] of activeSessions) {
    if (id === excludedVisitorId) continue
    try {
      const writer = s.datagrams.writable.getWriter()
      writer.write(payload).catch(() => {})
      writer.releaseLock()
    } catch {
      // ignore if locked or closed
    }
  }
}

async function sendJsonMessage(
  session: { createUnidirectionalStream: () => Promise<WritableStream<Uint8Array>> },
  messageObj: Record<string, unknown>,
) {
  const stream = await session.createUnidirectionalStream()
  const writer = stream.getWriter()
  await writer.write(new TextEncoder().encode(JSON.stringify(messageObj)))
  await writer.close()
  writer.releaseLock()
}
