<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import MyVisitorId from "@/components/MyVisitorId.vue"
import TouchControls from "@/components/TouchControls.vue"
import { worldMismatch } from "@/store/network"
</script>

<template>
  <div style="position: absolute; top: 0; left: 0; right: 0; color: white; display: flex; gap: 4px">
    <div>
      <MyVisitorId />
      <Datagrams />
    </div>
    <p style="color: #1a1a24">Simple soapbox cars in a shared physics environment.</p>
  </div>
  <div
    v-if="worldMismatch"
    style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 16px 24px; border-radius: 8px; background: #1a1a24; color: white; text-align: center"
  >
    This page and the server run different versions of the world. Reload the page to update.
  </div>
  <TouchControls />
</template>

<style scoped></style>
