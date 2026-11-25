/**
 * Slot 1 wins when it holds a pad, even if slot 0 does too (owner's setup). Otherwise use the first connected pad
 * with the standard mapping: the button and axis indices below assume it, and it skips non-gamepad devices.
 */
function pickGamepad(): Gamepad | null {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []
  const preferred = pads[1]
  if (preferred?.connected) return preferred
  return pads.find((pad): pad is Gamepad => !!pad?.connected && pad.mapping === "standard") ?? null
}

export default function getGamePadState() {
  const gp = pickGamepad()
  if (!gp) {
    return { steer: 0, throttle: 0, brake: 0, connected: false }
  }
  const steer = gp.axes[0] || 0
  const throttle = gp.buttons[7] ? (gp.buttons[7].value ?? 0) : 0
  const brake = gp.buttons[6] ? (gp.buttons[6].value ?? 0) : 0
  return { steer, throttle, brake, connected: true }
}
