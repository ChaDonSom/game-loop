<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"
import { cycleQuality, qualityLevel, qualityOverridden, qualitySetting } from "@/three/quality"
import {
  touchVisible,
  wheelDragSetting,
  wheelFlick,
  wheelLockSetting,
  wheelTangentReach,
  wheelTargetMark,
  wheelTrackCue,
} from "@/input/touch"
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
const dragMode = wheelDragSetting.value
const reach = wheelTangentReach.value
const trackCue = wheelTrackCue.value
const targetMark = wheelTargetMark.value
const flick = wheelFlick.value
const lockDeg = wheelLockSetting.value
/** angular → tangent → circles → angular */
function toggleDragMode() {
  wheelDragSetting.set(dragMode.value === "angular" ? "tangent" : dragMode.value === "tangent" ? "circles" : "angular")
}
function toggleFlick() {
  wheelFlick.set(flick.value === "on" ? "off" : "on")
}
function onLockInput(e: Event) {
  wheelLockSetting.set(Number((e.target as HTMLInputElement).value))
}
function toggleReach() {
  wheelTangentReach.set(reach.value === "edge" ? "fixed" : "edge")
}
function toggleTrackCue() {
  wheelTrackCue.set(trackCue.value === "on" ? "off" : "on")
}
function toggleTargetMark() {
  wheelTargetMark.set(targetMark.value === "on" ? "off" : "on")
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
        class="pill icon"
        :title="`Wheel drag: ${dragMode}`"
        :aria-label="`Wheel drag: ${dragMode}`"
        @click="toggleDragMode"
      >
        <svg viewBox="-8 -8 16 16" aria-hidden="true">
          <circle r="5" class="stroke" />
          <template v-if="dragMode === 'angular'">
            <circle cx="0" cy="-5" r="1.6" class="fill" />
            <path d="M 3.2 -6.6 A 7.3 7.3 0 0 1 6.8 -2.6" class="stroke" />
          </template>
          <line v-else-if="dragMode === 'tangent'" x1="-6" y1="-5" x2="6" y2="-5" class="stroke" />
          <path v-else d="M 1 -1.5 A 2 2 0 1 1 -1.6 1.2 A 3.4 3.4 0 1 1 3.6 -2.2" class="stroke" />
        </svg>
      </button>
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
      <template v-if="dragMode === 'tangent'">
        <button
          type="button"
          class="pill"
          :class="{ off: reach !== 'edge' }"
          :title="`Tangent reach: ${reach === 'edge' ? 'to the screen edge' : 'fixed'}`"
          :aria-label="`Tangent reach: ${reach}`"
          @click="toggleReach"
        >
          edge
        </button>
        <button
          type="button"
          class="pill"
          :class="{ off: trackCue !== 'on' }"
          :title="`Track cue: ${trackCue}`"
          :aria-label="`Track cue: ${trackCue}`"
          @click="toggleTrackCue"
        >
          track
        </button>
        <button
          v-if="trackCue === 'on'"
          type="button"
          class="pill"
          :class="{ off: targetMark !== 'on' }"
          :title="`Target mark: ${targetMark}`"
          :aria-label="`Target mark: ${targetMark}`"
          @click="toggleTargetMark"
        >
          target
        </button>
      </template>
    </template>
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
}
.pill.icon svg {
  width: 17px;
  height: 17px;
}
.pill.icon .stroke {
  fill: none;
  stroke: white;
  stroke-width: 1.4;
  stroke-linecap: round;
}
.pill.icon .fill {
  fill: white;
}
.tagline {
  margin: 0 0 0 4px;
  color: #1a1a24;
}
</style>
