<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import MyVisitorId from "@/components/MyVisitorId.vue"
</script>

<template>
  <div style="position: absolute; top: 0; left: 0; right: 0; color: white; display: flex; gap: 4px">
    <div>
      <MyVisitorId />
      <Datagrams />
    </div>
    <p>Simple soapbox cars in a shared physics environment.</p>
  </div>
</template>

<style scoped></style>
