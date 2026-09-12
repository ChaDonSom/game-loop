<script setup lang="ts">
import { getTransport } from "@/shared/transport"
import { ref, onMounted } from "vue"

const count = ref<number | null>(null)
const status = ref("connecting")

onMounted(async () => {
  const transport = await getTransport()

  status.value = "connected"

  const reader = transport.datagrams.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const msg = JSON.parse(new TextDecoder().decode(value))
    count.value = msg.count
  }
})
</script>

<template>
  <div>
    <p>Status: {{ status }}</p>
    <p>Count from server: {{ count ?? "—" }}</p>
  </div>
</template>
