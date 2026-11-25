<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"

/** Fullscreen on a phone hides the browser's reload button. */
function reload() {
  location.reload()
}
</script>

<template>
  <div class="top-bar">
    <Datagrams />
    <button type="button" class="reload" title="Reload page" aria-label="Reload page" @click="reload">↻</button>
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
.reload {
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
