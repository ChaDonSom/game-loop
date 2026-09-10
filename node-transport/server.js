import { Http3Server } from "@fails-components/webtransport"
import { readFileSync } from "fs"

const server = new Http3Server({
  port: 4433,
  host: "0.0.0.0",
  cert: readFileSync("/etc/letsencrypt/live/web-transport.somero.dev/fullchain.pem"),
  privKey: readFileSync("/etc/letsencrypt/live/web-transport.somero.dev/privkey.pem"),
})

server.startServer()
console.log("WebTransport server listening on :4433")
;(async () => {
  const sessionStream = server.sessionStream("/count")
  const reader = sessionStream.getReader()

  while (true) {
    const { done, value: session } = await reader.read()
    if (done) break
    handleSession(session)
  }
})()

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
