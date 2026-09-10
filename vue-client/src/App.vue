<script setup lang="ts">
import Arena from "@/components/Arena.vue"
import Player from "@/components/Player.vue"
</script>

<template>
  <h1>Game loop</h1>
  <p>There is literally a game loop running at 60 fps now.</p>
  <Arena style="width: 100%; height: 100%; position: absolute; top: 0; left: 0">
    <Player />
  </Arena>
</template>

<style scoped></style>
