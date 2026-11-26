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

/** Gamepad button for flip. Standard mapping: 3 is the top face button (Y on Xbox, triangle on PlayStation). */
export const GAMEPAD_FLIP_BUTTON = 3

/** True while the flip button shows. Changes only when the value changes, so there is no re-render each frame. */
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

/** Flip presses this session, for `controls.flip`. */
export function getFlipCount() {
  return flipCount
}

/** Call each physics step. Shows the button once the car has been stuck for `FLIP_BUTTON_DELAY_S`. */
export function updateCanFlip(dt: number, stuck: boolean) {
  stuckSeconds = stuck ? stuckSeconds + dt : 0
  const next = stuckSeconds >= FLIP_BUTTON_DELAY_S
  if (next !== canFlip.value) canFlip.value = next
}

/**
 * Call on each new connection, before any `controls` goes out. The server counts presses from 0 for a new player, so
 * an old count would make it ignore the next presses.
 */
export function resetFlipCount() {
  flipCount = 0
}

/** Call on respawn: no pending press, and the button waits for a new stuck time. */
export function resetFlip() {
  pendingPress = false
  stuckSeconds = 0
  if (canFlip.value) canFlip.value = false
}

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyF" && !e.repeat) requestFlip()
})
