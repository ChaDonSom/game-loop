<script setup lang="ts">
import Datagrams from "@/components/Datagrams.vue"
import MyVisitorId from "@/components/MyVisitorId.vue"
</script>

<template>
  <div style="position: absolute; top: 0; left: 0; color: white">
    <p>
      Welcome to the game loop demo! This demonstrates a simple game loop running at 60 frames per second. Beside the
      game loop is a networked environment where multiple players can interact in real-time, based on WebTransport.
    </p>
    <Datagrams />
    <MyVisitorId />
  </div>
</template>

<style scoped></style>
