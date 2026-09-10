import { createApp, ref } from "vue"
import App from "./App.vue"
import { updateHooks } from "@/store/updateHooks.ts"

createApp(App).mount("#app")

let lastTime: number = performance.now()
let lag: number = 0.0 // Accumulated time for fixed steps
const MS_PER_UPDATE: number = 16.67 // 60Hz fixed step

function gameLoop(currentTime: number) {
  // Calculate elapsed time since last frame
  const elapsed = currentTime - lastTime
  lastTime = currentTime
  lag += elapsed

  // Run fixed updates as many times as needed to catch up
  while (lag >= MS_PER_UPDATE) {
    update(MS_PER_UPDATE / 1000) // Fixed deltaTime in seconds
    lag -= MS_PER_UPDATE
  }

  // Render with interpolation (see below)
  render(lag / MS_PER_UPDATE)

  requestAnimationFrame(gameLoop)
}
requestAnimationFrame(gameLoop)

function update(deltaTime: number) {
  // Update your physics or game logic here using the fixed deltaTime
  updateHooks.value.forEach((hook) => hook(deltaTime))
}

function render(interpolation: number) {
  // Render your game scene here using the interpolation factor
}
