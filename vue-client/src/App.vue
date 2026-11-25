<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"
import { onBeforeUnmount, onMounted, ref } from "vue"

/** Fullscreen on a phone hides the browser's reload button. */
function reload() {
  location.reload()
}

// Fullscreen API. Prefixed on older Safari. iPhone Safari does not offer it for pages: there, Add to Home Screen
// (see the manifest and apple meta tags in index.html) is the way to hide the browser bar, so the button stays hidden.
type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
const doc = document as WebkitDocument
const canFullscreen = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
const isFullscreen = ref(false)

function syncFullscreen() {
  isFullscreen.value = !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

async function toggleFullscreen() {
  try {
    if (isFullscreen.value) {
      await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
      return
    }
    const root = document.documentElement as WebkitElement
    await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: "hide" }) : root.webkitRequestFullscreen?.())
    // Android allows an orientation lock only in fullscreen. Other browsers reject it: keep the current orientation.
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    await orientation.lock?.("landscape").catch(() => {})
  } catch {
    // Refused (no user gesture, or blocked): stay as is.
  }
}

onMounted(() => {
  document.addEventListener("fullscreenchange", syncFullscreen)
  document.addEventListener("webkitfullscreenchange", syncFullscreen)
})
onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreen)
  document.removeEventListener("webkitfullscreenchange", syncFullscreen)
})
</script>

<template>
  <div class="top-bar">
    <Datagrams />
    <button type="button" class="pill" title="Reload page" aria-label="Reload page" @click="reload">↻</button>
    <button
      v-if="canFullscreen"
      type="button"
      class="pill"
      :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
      :aria-label="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
      @click="toggleFullscreen"
    >
      {{ isFullscreen ? "⤡" : "⛶" }}
    </button>
    <p class="tagline">Simple soapbox cars in a shared physics environment.</p>
  </div>
  <div
    v-if="worldMismatch"
    style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 16px 24px; border-radius: 8px; background: #1a1a24; color: white; text-align: center"
  >
    This page and the server run different versions of the world. Reload the page to update.
  </div>
  <TouchControls />
</template>

<style scoped>
.top-bar {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 8px);
  left: calc(env(safe-area-inset-left) + 8px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 11;
}
.pill {
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  background: rgba(29, 29, 34, 0.7);
  color: white;
  font: 600 12px/1.4 system-ui, sans-serif;
  cursor: pointer;
  touch-action: manipulation;
}
.tagline {
  margin: 0 0 0 4px;
  color: #1a1a24;
}
</style>
