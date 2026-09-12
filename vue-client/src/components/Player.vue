<script lang="ts" setup>
import Character from "@/components/Character.vue"
import { queueNetworkUpdate } from "@/network"
import { remotePlayers } from "@/store/network"
import { updateHooks } from "@/store/updateHooks"
import { onBeforeUnmount, onMounted, ref } from "vue"
import playerImage from "@/assets/image2.png"

const keysDown = ref<{ [key: string]: boolean }>({})
function onKeyDown(event: KeyboardEvent) {
  keysDown.value[event.key] = true
}

function onKeyUp(event: KeyboardEvent) {
  keysDown.value[event.key] = false
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown)
  window.removeEventListener("keyup", onKeyUp)
})

let velocity = { x: 0, y: 0 }
updateHooks.value.push(function update(deltaTime: number) {
  const input = getInputXY()
  const mod = 5000
  // Instead of directly setting the new value, we increment velocity in that direction. We have an always-decaying
  // velocity effect afterward as well.
  velocity.x += input.x * deltaTime * mod
  velocity.y += input.y * deltaTime * mod

  // Apply some decay to the velocity
  const decay = 0.9
  velocity.x *= decay
  velocity.y *= decay

  // Collision detection with remote players
  Object.values(remotePlayers.value).forEach((remotePlayer) => {
    const snapshots = remotePlayer || []
    const latestSnapshot = snapshots[snapshots.length - 1] || { x: 0, y: 0 }
    // Simple collision detection: check if the bounding boxes overlap
    const dx = xy.value.x - latestSnapshot.x
    const dy = xy.value.y - latestSnapshot.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 50) {
      // Bounce back the player to avoid overlapping with the remote player
      xy.value.x = latestSnapshot.x + (dx / distance) * 50
      xy.value.y = latestSnapshot.y + (dy / distance) * 50
    }
  })

  // We can only apply the change if it doesn't go beyond the screen boundaries
  const newX = xy.value.x + velocity.x * deltaTime
  const newY = xy.value.y + velocity.y * deltaTime
  xy.value.x = Math.max(0, Math.min(window.innerWidth - 50, newX))
  xy.value.y = Math.max(0, Math.min(window.innerHeight - 50, newY))

  // Only if the position has changed significantly, we send a network update
  if (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01) {
    queueNetworkUpdate({ x: xy.value.x, y: xy.value.y })
  }
})

const xy = ref({ x: 0, y: 0 })

function getInputXY() {
  // Replace this with actual input handling logic
  const x = (keysDown.value["ArrowRight"] ? 1 : 0) - (keysDown.value["ArrowLeft"] ? 1 : 0)
  const y = (keysDown.value["ArrowDown"] ? 1 : 0) - (keysDown.value["ArrowUp"] ? 1 : 0)
  return { x, y }
}
</script>

<template>
  <Character
    :style="{
      transform: `translate(${xy.x}px, ${xy.y}px)`,
      backgroundImage: `url(${playerImage})`,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    }"
  ></Character>
</template>
