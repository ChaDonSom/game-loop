<script setup lang="ts">
import { getTransport } from "@/shared/transport"
import { ref, onMounted } from "vue"

const visitorId = ref<string | null>(null)
const status = ref("connecting")

onMounted(async () => {
  const transport = await getTransport()

  status.value = "connected"

  const reader = transport.incomingUnidirectionalStreams.getReader()
  while (true) {
    const { done, value: stream } = await reader.read()
    if (done) break
    handleIncomingStream(stream)
  }
})

async function handleIncomingStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>
  const reader = stream.pipeThrough(decoder).getReader()
  const { value } = await reader.read()
  if (!value) return
  const data = JSON.parse(value)

  if (data.type === "welcome") {
    // Save our personal ID sent by the server
    visitorId.value = data.yourId
  }
}
</script>

<template>
  <div>
    <p>Status: {{ status }}</p>
    <p>My visitor id: {{ visitorId ?? "—" }}</p>
  </div>
</template>
