<script lang="ts" setup>
import Character from "@/components/Character.vue"
import { updateHooks } from "@/store/updateHooks"
import { onBeforeUnmount, onMounted, ref } from "vue"

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

  // We can only apply the change if it doesn't go beyond the screen boundaries
  const newX = xy.value.x + velocity.x * deltaTime
  const newY = xy.value.y + velocity.y * deltaTime
  xy.value.x = Math.max(0, Math.min(window.innerWidth - 50, newX))
  xy.value.y = Math.max(0, Math.min(window.innerHeight - 50, newY))
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
  <Character :style="{ transform: `translate(${xy.x}px, ${xy.y}px)` }"></Character>
</template>
