<script lang="ts" setup>
import Character from "@/components/Character.vue"
import { queueNetworkUpdate } from "@/network"
import { remotePlayers } from "@/store/network"
import { updateHooks } from "@/store/updateHooks"
import { onBeforeUnmount, onMounted, ref } from "vue"
import playerImage from "@/assets/image2.png"
import { renderHooks } from "@/store/renderHooks"

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

const xy = ref({ x: 0, y: 0 })
let velocity = { x: 0, y: 0 }
let result = { x: xy.value.x, y: xy.value.y }
let prevResult = { x: xy.value.x, y: xy.value.y }

function update(deltaTime: number) {
  prevResult = { x: result.x, y: result.y }
  const input = getInputXY()
  const mod = 5000
  // Instead of directly setting the new value, we increment velocity in that direction. We have an always-decaying
  // velocity effect afterward as well.
  const newVelocity = { x: velocity.x, y: velocity.y }
  newVelocity.x += input.x * deltaTime * mod
  newVelocity.y += input.y * deltaTime * mod

  // Apply some decay to the velocity
  const decay = 0.9
  newVelocity.x *= decay
  newVelocity.y *= decay

  // Collision detection with remote players
  Object.values(remotePlayers.value).forEach((remotePlayer) => {
    const snapshots = remotePlayer || []
    const latestSnapshot = snapshots[snapshots.length - 1] || { x: 0, y: 0 }
    // Simple collision detection: check if the bounding boxes overlap
    const dx = result.x - latestSnapshot.x
    const dy = result.y - latestSnapshot.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < 50 && distance > 0) {
      // Bounce back the player to avoid overlapping with the remote player
      result.x = latestSnapshot.x + (dx / distance) * 50
      result.y = latestSnapshot.y + (dy / distance) * 50
    }
  })

  // We can only apply the change if it doesn't go beyond the screen boundaries
  const newX = result.x + newVelocity.x * deltaTime
  const newY = result.y + newVelocity.y * deltaTime
  result.x = Math.max(0, Math.min(window.innerWidth - 50, newX))
  result.y = Math.max(0, Math.min(window.innerHeight - 50, newY))
  velocity = newVelocity
}

function getInputXY() {
  // Replace this with actual input handling logic
  const x = (keysDown.value["ArrowRight"] ? 1 : 0) - (keysDown.value["ArrowLeft"] ? 1 : 0)
  const y = (keysDown.value["ArrowDown"] ? 1 : 0) - (keysDown.value["ArrowUp"] ? 1 : 0)
  return { x, y }
}

onMounted(() => {
  updateHooks.value.push(update)
})
onBeforeUnmount(() => {
  const index = updateHooks.value.indexOf(update)
  if (index !== -1) {
    updateHooks.value.splice(index, 1)
  }
})

function render(interpolation: number) {
  xy.value.x = prevResult.x + (result.x - prevResult.x) * interpolation
  xy.value.y = prevResult.y + (result.y - prevResult.y) * interpolation

  // Only if the position has changed significantly, we send a network update
  if (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01) {
    queueNetworkUpdate({ x: result.x, y: result.y })
  }
}
onMounted(() => {
  renderHooks.value.push(render)
})
onBeforeUnmount(() => {
  const index = renderHooks.value.indexOf(render)
  if (index !== -1) {
    renderHooks.value.splice(index, 1)
  }
})
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
