<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"
import { cycleQuality, qualityLevel, qualityOverridden, qualitySetting } from "@/three/quality"
import { touchVisible, wheelFlick, wheelLockSetting } from "@/input/touch"
import { canFlip, requestFlip } from "@/input/flip"
import { applyOrientation, canLockOrientation, isInstalledApp, orientationChoice, toggleOrientation } from "@/orientation"
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
    // Android allows an orientation lock only in fullscreen or an installed app. Other browsers reject it.
    await applyOrientation()
  } catch {
    // Refused (no user gesture, or blocked): stay as is.
  }
}

const quality = qualitySetting.value
const orientation = orientationChoice.value

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
      v-if="canLockOrientation && (isInstalledApp || isFullscreen)"
      type="button"
      class="pill icon"
      :title="`Screen: ${orientation}. Tap to turn.`"
      :aria-label="`Screen: ${orientation}. Tap to turn.`"
      @click="toggleOrientation"
    >
      <!-- Material Symbols "screen_rotation" (outlined, weight 400). Apache License 2.0, Google. -->
      <svg viewBox="0 -960 960 960" aria-hidden="true">
        <path
          d="M516-191 191-516q-18-20-18-46t18-46l166-165q18-20 44.99-20 26.99 0 47.01 20l325 325q19 19 19 46t-19 46L608-191q-18 20-44.99 20-26.99 0-47.01-20Zm46-39 172-172-331-332-172 172 331 332ZM478 1q-98.51 0-185.58-37.5-87.07-37.5-152.24-103Q75-205 37.5-292.18T0-478h60q0 80 28.5 151.5t78.5 127Q217-144 285.5-109T433-66L303-196l43-43L574-11q-23 7-47.48 9.5Q502.04 1 478 1Zm422-479q0-80-28-151.5T794.5-757Q745-813 677-848.5T530-892l128 128-43 43-228-228q23-6 45.5-8.5T478-960q100 0 187.5 38t153 103.5Q884-753 922-665.5T960-478h-60Zm-417-4Z"
        />
      </svg>
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
.pill.icon {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
}
.pill.icon svg {
  width: 17px;
  height: 17px;
  fill: currentColor;
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
