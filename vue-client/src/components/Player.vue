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

updateHooks.value.push(function update(deltaTime: number) {
  // Update player logic here
  const input = getInputXY()
  const mod = 100
  xy.value.x += input.x * deltaTime * mod
  xy.value.y += input.y * deltaTime * mod
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
  <Character :style="{ top: xy.y + 'px', left: xy.x + 'px' }"></Character>
</template>
