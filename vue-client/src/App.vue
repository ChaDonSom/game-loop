<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"
import { cycleQuality, qualityLevel, qualityOverridden, qualitySetting } from "@/three/quality"
import { touchVisible, wheelFlick, wheelLockSetting } from "@/input/touch"
import { canFlip, requestFlip } from "@/input/flip"
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

const quality = qualitySetting.value

// Touch wheel settings. Shown only while the touch controls are.
const flick = wheelFlick.value
const lockDeg = wheelLockSetting.value
function toggleFlick() {
  wheelFlick.set(flick.value === "on" ? "off" : "on")
}
function onLockInput(e: Event) {
  wheelLockSetting.set(Number((e.target as HTMLInputElement).value))
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
    <button
      v-if="!qualityOverridden"
      type="button"
      class="pill"
      :title="`Render quality: ${quality}${quality === 'auto' ? ` (step ${qualityLevel})` : ''}. Tap to change.`"
      :aria-label="`Render quality: ${quality}`"
      @click="cycleQuality"
    >
      Q {{ quality }}{{ quality === "auto" && qualityLevel > 0 ? ` −${qualityLevel}` : "" }}
    </button>
    <template v-if="touchVisible">
      <button
        type="button"
        class="pill"
        :class="{ off: flick !== 'on' }"
        :title="`Flick with momentum: ${flick}`"
        :aria-label="`Flick with momentum: ${flick}`"
        @click="toggleFlick"
      >
        flick
      </button>
      <label class="pill lock" title="Wheel turn, lock to lock">
        lock {{ lockDeg }}°
        <input
          type="range"
          :min="wheelLockSetting.min"
          :max="wheelLockSetting.max"
          step="30"
          :value="lockDeg"
          aria-label="Wheel turn, lock to lock, degrees"
          @input="onLockInput"
        />
      </label>
    </template>
    <p class="tagline">Simple soapbox cars in a shared physics environment.</p>
    <button
      v-if="canFlip"
      type="button"
      class="pill flip"
      title="Flip the car upright (F)"
      aria-label="Flip the car upright"
      @click="requestFlip"
    >
      Flip
    </button>
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
  right: calc(env(safe-area-inset-right) + 8px);
  display: flex;
  align-items: flex-start;
  gap: 6px;
  z-index: 11;
}
.pill {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  background: rgba(29, 29, 34, 0.7);
  color: white;
  font: 600 12px/1.4 system-ui, sans-serif;
  cursor: pointer;
  touch-action: manipulation;
}
.pill.lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}
.pill.lock input {
  width: 90px;
  accent-color: #ffd166;
}
.pill.off {
  opacity: 0.5;
}
/* Big thumb target, at the far right. */
.pill.flip {
  margin-left: auto;
  min-width: 64px;
  min-height: 44px;
  padding: 0 16px;
  background: rgba(196, 72, 24, 0.85);
  font-size: 16px;
}
/* Takes the space left, and cuts off with an ellipsis when the pills need it. */
.tagline {
  flex: 1 1 0;
  min-width: 0;
  margin: 0 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1a1a24;
}
</style>
