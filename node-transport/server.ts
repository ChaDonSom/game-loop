import "dotenv/config"
import { Http3Server } from "@fails-components/webtransport"
import { readFileSync } from "fs"
import ensureLocalCert from "./ensureLocalCert.js"
import crypto from "crypto"
import initServerRapier from "./initServerRapier.js"
import controls from "./controls.js"
import {
  WORLD_VERSION,
  decodeMessage,
  encodeMessage,
  isClientControlsMessage,
  isClientPositionMessage,
  packVehicleStates,
  FALLBACK_MAX_DATAGRAM_BYTES,
  type PositionSnapshot,
  type ServerDatagramMessage,
  type ServerStreamMessage,
  type VehicleStateMessage,
} from "@game-loop/shared"

type Session = {
  ready: Promise<void>
  visitorId?: string
  datagrams: {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    maxDatagramSize?: number
  }
  closed: Promise<void>
  createUnidirectionalStream: () => Promise<WritableStream<Uint8Array>>
}

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
const activeSessions = new Map<string, Session>()
/** Up by 1 on each join or leave. Lets a client order roster events that arrive on separate streams. */
let rosterSeq = 0
const playerSnapshots = new Map<string, PositionSnapshot>()

const sessionStream = server.sessionStream("/wt")
server.startServer()
await server.ready
console.log(`HTTP/3 listening on 0.0.0.0:${WT_PORT} - waiting for WebTransport sessions...`)
const simulation = await initServerRapier(broadcastState)
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

async function handleSession(session: Session) {
  await session.ready
  console.log("client connected")

  const visitorId = crypto.randomUUID()
  session.visitorId = visitorId
  activeSessions.set(visitorId, session)
  const spawnIndex = simulation.addPlayer(visitorId)
  rosterSeq++
  broadcastStream({ type: "join", id: visitorId, rosterSeq }, visitorId)

  sendJsonMessage(session, {
    type: "welcome",
    yourId: visitorId,
    spawnIndex,
    worldVersion: WORLD_VERSION,
    players: Array.from(activeSessions.keys()),
    rosterSeq,
  }).catch((err) => {
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
        const msg = decodeMessage(value)
        const isPosition = isClientPositionMessage(msg)
        if (!isPosition && !isClientControlsMessage(msg)) continue
        if (msg.seq <= lastClientSeq) continue // drop duplicate or out-of-order datagram
        lastClientSeq = msg.seq

        if (isPosition) {
          const snapshot: PositionSnapshot = { seq: msg.seq, x: msg.x, y: msg.y, t: Date.now() }
          playerSnapshots.set(visitorId, snapshot)
          broadcastDatagram({ type: "pos", id: visitorId, ...snapshot }, visitorId)
          continue
        }

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
    writeDatagram(session, encodeMessage({ type: "count", seq: count, count, t: Date.now() }))
  }, 1000)

  const connectedAt = Date.now()
  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    clearInterval(interval)
    if (session.visitorId) {
      activeSessions.delete(session.visitorId)
      simulation.removePlayer(session.visitorId)
      playerSnapshots.delete(session.visitorId)
      rosterSeq++
      broadcastStream({ type: "leave", id: session.visitorId, rosterSeq })
      console.log(`client left after ${((Date.now() - connectedAt) / 1000).toFixed(1)} s`)
    }
  }

  session.closed.then(cleanup).catch(cleanup)
}

/** The session's datagram size limit, or the fallback if it reports none. */
function maxDatagramBytes(session: Session) {
  const size = session.datagrams.maxDatagramSize
  return typeof size === "number" && size > 0 ? size : FALLBACK_MAX_DATAGRAM_BYTES
}

const lastTooBigWarning = new WeakMap<Session, number>()

/**
 * Writes one datagram. A loss is fine: that is the point of datagrams. A datagram over the size limit is a bug, not a
 * loss: the WebTransport library drops it without an error. So warn, at most once a minute per session.
 */
function writeDatagram(session: Session, payload: Uint8Array) {
  const limit = maxDatagramBytes(session)
  if (payload.length > limit) {
    const now = Date.now()
    if (now - (lastTooBigWarning.get(session) ?? 0) > 60_000) {
      lastTooBigWarning.set(session, now)
      console.warn(`Datagram of ${payload.length} B is over the ${limit} B limit. It will be dropped.`)
    }
  }
  try {
    const writer = session.datagrams.writable.getWriter()
    writer.write(payload).catch(() => {})
    writer.releaseLock()
  } catch {
    // ignore if locked or closed
  }
}

function broadcastDatagram(message: ServerDatagramMessage, excludedVisitorId?: string) {
  const payload = encodeMessage(message)
  for (const [id, s] of activeSessions) {
    if (id === excludedVisitorId) continue
    writeDatagram(s, payload)
  }
}

/** Sends one tick of vehicle state to every session, split into parts that fit that session's datagram limit. */
function broadcastState(message: VehicleStateMessage) {
  const partsByLimit = new Map<number, Uint8Array[]>()
  for (const s of activeSessions.values()) {
    const limit = maxDatagramBytes(s)
    let parts = partsByLimit.get(limit)
    if (!parts) {
      parts = packVehicleStates(message.players, message.seq, message.t, limit)
      partsByLimit.set(limit, parts)
    }
    for (const part of parts) writeDatagram(s, part)
  }
}

/** Sends one message on a reliable stream to every session, except `excludedVisitorId`. */
function broadcastStream(message: ServerStreamMessage, excludedVisitorId?: string) {
  for (const [id, s] of activeSessions) {
    if (id === excludedVisitorId) continue
    sendJsonMessage(s, message).catch((err) => console.error(`Failed to send ${message.type} packet:`, err))
  }
}

async function sendJsonMessage(
  session: { createUnidirectionalStream: () => Promise<WritableStream<Uint8Array>> },
  message: ServerStreamMessage,
) {
  const stream = await session.createUnidirectionalStream()
  const writer = stream.getWriter()
  await writer.write(encodeMessage(message))
  await writer.close()
  writer.releaseLock()
}
