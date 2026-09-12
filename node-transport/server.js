import "dotenv/config"
import { Http3Server } from "@fails-components/webtransport"
import { readFileSync } from "fs"
import ensureLocalCert from "./ensureLocalCert.js"
import crypto from "crypto"

const CERT_PATH = process.env.CERT_PATH
const PRIV_KEY_PATH = process.env.PRIV_KEY_PATH

ensureLocalCert()

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err)
})

const server = new Http3Server({
  port: 4433,
  host: "0.0.0.0",
  secret: process.env.WT_SECRET || "changeit-to-something-real",
  cert: process.env.CERT_PATH ? readFileSync(CERT_PATH) : undefined,
  privKey: process.env.PRIV_KEY_PATH ? readFileSync(PRIV_KEY_PATH) : undefined,
})
const activeSessions = new Map()

await server.startServer()
console.log("HTTP/3 listening on 0.0.0.0:4433 - waiting for WebTransport sessions...")
;(async () => {
  const stream = await server.sessionStream("/wt")
  const reader = stream.getReader()

  while (true) {
    const { done, value: session } = await reader.read()
    if (done) {
      console.log("client disconnected")
      break
    }
    handleSession(session)
  }
})().catch((err) => console.error("Session loop crashed:", err))

async function handleSession(session) {
  await session.ready
  console.log("client connected")

  const visitorId = crypto.randomUUID()
  session.visitorId = visitorId
  activeSessions.set(visitorId, session)

  // Send a "Welcome" packet so client knows what server assigned as its visitor ID
  sendWelcomeMessage(session, visitorId)

  let lastClientSeq = -1
  ;(async () => {
    const reader = session.datagrams.readable.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      try {
        const msg = JSON.parse(new TextDecoder().decode(value))
        if (msg.type === "pos" && typeof msg.seq === "number" && msg.seq > lastClientSeq) {
          lastClientSeq = msg.seq
          broadcastDatagram(
            {
              type: "pos",
              id: visitorId,
              seq: msg.seq,
              x: msg.x,
              y: msg.y,
              t: Date.now(),
            },
            visitorId,
          )
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
    writer.write(payload).catch(() => {}) // drop silently if it fails, this is the point
    writer.releaseLock()
  }, 1000)

  session.closed
    .then(() => {
      clearInterval(interval)
      activeSessions.delete(session.visitorId)
    })
    .catch(() => {
      clearInterval(interval)
      activeSessions.delete(session.visitorId)
    })
}

function broadcastDatagram(messageObj, senderVisitorId) {
  const payload = new TextEncoder().encode(JSON.stringify(messageObj))
  for (const [id, s] of activeSessions.entries()) {
    if (id === senderVisitorId) continue
    try {
      const writer = s.datagrams.writable.getWriter()
      writer.write(payload).catch(() => {})
      writer.releaseLock()
    } catch {
      // ignore if locked or closed
    }
  }
}

async function sendWelcomeMessage(session, assignedId) {
  const stream = await session.createUnidirectionalStream()
  const writer = stream.getWriter()

  // Send the specific client its own ID
  const welcomePacket = JSON.stringify({ type: "welcome", yourId: assignedId })
  await writer.write(new TextEncoder().encode(welcomePacket))
  await writer.close()
  writer.releaseLock()
}
