<script setup lang="ts">
import { ref, onMounted } from "vue"

const count = ref(null)
const status = ref("connecting")

onMounted(async () => {
  try {
    const transport = new WebTransport("https://web-transport.somero.dev:4433/count")
    await transport.ready
    status.value = "connected"

    const reader = transport.datagrams.readable.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const msg = JSON.parse(new TextDecoder().decode(value))
      count.value = msg.count
    }
  } catch (err: { message: string } | unknown) {
    if (err && typeof err === "object" && "message" in err) {
      status.value = `error: ${err.message}`
    } else {
      status.value = "error: unknown"
    }
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
