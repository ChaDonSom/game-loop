import { ref } from "vue"

/**
 * Flip input: the on-screen button, key F, and gamepad Y. A press only counts here. The physics step takes it
 * (`takeFlipPress`), flips the car if it is stuck, and sends the press count to the server in `controls`.
 */

/**
 * YOUR CHOICE: seconds the car must stay stuck (`isStuckUpsideDown`) before the button shows. Too short, and the button
 * flashes while the car rolls over and settles. Too long, and the player waits on their roof.
 */
const FLIP_BUTTON_DELAY_S = 0.5

/** True while the flip button shows. A Vue ref ignores a write of the same value, so steps cost no re-render. */
export const canFlip = ref(false)

let pendingPress = false
let flipCount = 0
let gamepadHeld = false
let stuckSeconds = 0

export function requestFlip() {
  pendingPress = true
}

/** Call each physics step with the gamepad button state. A press counts on the step the button goes down. */
export function pollGamepadFlip(held: boolean) {
  if (held && !gamepadHeld) requestFlip()
  gamepadHeld = held
}

/** True once per press. Adds 1 to the count that `controls` carries. */
export function takeFlipPress() {
  if (!pendingPress) return false
  pendingPress = false
  flipCount++
  return true
}

/** Flip presses so far, for `controls.flip`. The server reacts to any change, so it never resets. */
export function getFlipCount() {
  return flipCount
}

/** Call each physics step. Shows the button once the car has been stuck for `FLIP_BUTTON_DELAY_S`. */
export function updateCanFlip(dt: number, stuck: boolean) {
  stuckSeconds = stuck ? stuckSeconds + dt : 0
  canFlip.value = stuckSeconds >= FLIP_BUTTON_DELAY_S
}

/** Call on respawn: no pending press, and the button waits for a new stuck time. */
export function resetFlip() {
  pendingPress = false
  stuckSeconds = 0
  canFlip.value = false
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyF" && !e.repeat) requestFlip()
})
