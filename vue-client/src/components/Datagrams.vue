<script setup lang="ts">
import { ref, onMounted } from "vue"

const count = ref<number | null>(null)
const status = ref("connecting")

function hexToU8(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/\s|:/g, "")
  const arr = new Uint8Array(new ArrayBuffer(clean.length / 2))
  for (let i = 0; i < clean.length; i += 2) {
    arr[i / 2] = parseInt(clean.substr(i, 2), 16)
  }
  return arr
}

onMounted(async () => {
  try {
    const transportUrl = import.meta.env.VITE_TRANSPORT_URL as string
    status.value = `connecting to ${transportUrl}...`

    // self-signed dev certs need a pinned hash; prod uses a CA-trusted cert, so skip it
    let options: WebTransportOptions = {}
    if (import.meta.env.DEV) {
      const hashRes = await fetch("/certs/cert-hash.json")
      if (!hashRes.ok) throw new Error("could not fetch /certs/cert-hash.json - did server.js generate it?")
      const { hashHex } = await hashRes.json()
      options = {
        serverCertificateHashes: [
          {
            algorithm: "sha-256",
            value: hexToU8(hashHex),
          },
        ],
      }
    }

    const transport = new WebTransport(transportUrl, options)

    await transport.ready
    status.value = "connected"

    const reader = transport.datagrams.readable.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const msg = JSON.parse(new TextDecoder().decode(value))
      count.value = msg.count
    }
  } catch (err: any) {
    status.value = `error: ${err?.message || err}`
    console.error(err)
  }
})
</script>

<template>
  <div>
    <p>Status: {{ status }}</p>
    <p>Count from server: {{ count ?? "—" }}</p>
  </div>
</template>
