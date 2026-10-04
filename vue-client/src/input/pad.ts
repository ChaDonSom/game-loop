export default function getGamePadState() {
  const gp = navigator.getGamepads ? navigator.getGamepads()[1] : null
  if (!gp) {
    return { steer: 0, throttle: 0, brake: 0, connected: false }
  }
  const steer = gp.axes[0] || 0
  const throttle = gp.buttons[7] ? (gp.buttons[7].value ?? 0) : 0
  const brake = gp.buttons[6] ? (gp.buttons[6].value ?? 0) : 0
  return { steer, throttle, brake, connected: true }
}
