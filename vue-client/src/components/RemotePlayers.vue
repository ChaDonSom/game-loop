<script setup lang="ts">
import { ref } from "vue"
import { remotePlayers } from "../store/network"
import { updateHooks } from "@/store/updateHooks"
import playerImage from "@/assets/image.png"

const renderedPlayers = ref<Record<string, { x: number; y: number }>>({})

const INTERPOLATION_DELAY = 100

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function update() {
  const renderTime = performance.now() - INTERPOLATION_DELAY

  for (const [id, history] of Object.entries(remotePlayers.value)) {
    if (!Array.isArray(history)) continue // skip if history is not an array
    if (!history || history.length < 2) {
      continue
    }

    const latest = history[history.length - 1]
    // If renderTime is past latest snapshot, stay at latest position
    if (latest && renderTime >= latest.time) {
      renderedPlayers.value[id] = { x: latest.x, y: latest.y }
      continue
    }
    // Find the two snapshots surrounding renderTime.
    let before = history[0]
    let after = history[1]
    if (!before || !after) {
      continue
    }

    for (let i = 1; i < history.length; i++) {
      const snap = history[i]
      const prevSnap = history[i - 1]
      if (snap && prevSnap && snap.time >= renderTime) {
        before = prevSnap
        after = snap
        break
      }
    }

    const duration = after.time - before.time

    const t = duration === 0 ? 0 : (renderTime - before.time) / duration

    renderedPlayers.value[id] = {
      x: lerp(before.x, after.x, t),
      y: lerp(before.y, after.y, t),
    }
  }
}

updateHooks.value.push(update)
</script>

<template>
  <div
    v-for="(player, id) in renderedPlayers"
    :key="id"
    style="
      width: 50px;
      height: 50px;
      background: blue;
      position: absolute;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    "
    :style="{
      transform: `translate(${player.x}px, ${player.y}px)`,
      backgroundImage: `url(${playerImage})`,
    }"
  />
</template>
