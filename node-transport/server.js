import "dotenv/config"
import { Http3Server } from "@fails-components/webtransport"
import { readFileSync } from "fs"

const CERT_PATH = process.env.CERT_PATH
const PRIV_KEY_PATH = process.env.PRIV_KEY_PATH

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

server.startServer()
;(async () => {
  const stream = await server.sessionStream("/count")
  const reader = stream.getReader()

  while (true) {
    const { done, value: session } = await reader.read()
    if (done) break
    handleSession(session)
  }
})().catch((err) => console.error("Session loop crashed:", err))

async function handleSession(session) {
  await session.ready
  console.log("client connected")

  let count = 0
  const interval = setInterval(() => {
    count++
    const payload = new TextEncoder().encode(JSON.stringify({ count, t: Date.now() }))
    const writer = session.datagrams.writable.getWriter()
    writer.write(payload).catch(() => {}) // drop silently if it fails, this is the point
    writer.releaseLock()
  }, 1000)

  session.closed.then(() => clearInterval(interval)).catch(() => clearInterval(interval))
}
