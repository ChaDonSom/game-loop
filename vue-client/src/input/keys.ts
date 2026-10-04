const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  KeyA: false,
  KeyD: false,
  KeyW: false,
  KeyS: false,
}
window.addEventListener("keydown", (e) => {
  const code = e.code as keyof typeof keys
  if (code in keys) keys[code] = true
})
window.addEventListener("keyup", (e) => {
  const code = e.code as keyof typeof keys
  if (code in keys) keys[code] = false
})
export default keys
