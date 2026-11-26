/**
 * Frame-time readout for profiling on a real device. Off unless the page URL has `?perf`.
 * Shows, twice a second: frames per second, and per-frame JS time split into physics and render (avg / worst).
 * The frame interval minus the JS total is time the browser spent elsewhere: GPU, compositing, or idle.
 */
const enabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("perf")

type Sample = { interval: number; physics: number; render: number; total: number }
const samples: Sample[] = []
let panel: HTMLDivElement | null = null
let lastReport = 0

function ensurePanel() {
  if (panel) return panel
  panel = document.createElement("div")
  panel.style.cssText =
    "position:fixed;top:calc(env(safe-area-inset-top) + 40px);right:8px;z-index:20;padding:4px 8px;border-radius:6px;" +
    "background:rgba(0,0,0,0.6);color:#fff;font:11px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:none"
  document.body.appendChild(panel)
  return panel
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0)
const fmt = (xs: number[]) => `${avg(xs).toFixed(1)} / ${max(xs).toFixed(1)}`

/** Call once per animation frame, with times in ms. */
export function recordFrame(sample: Sample) {
  if (!enabled) return
  samples.push(sample)
  const now = performance.now()
  if (now - lastReport < 500) return
  lastReport = now
  const fps = 1000 / avg(samples.map((s) => s.interval))
  ensurePanel().textContent =
    `fps      ${fps.toFixed(0)}\n` +
    `frame ms ${fmt(samples.map((s) => s.interval))}\n` +
    `js ms    ${fmt(samples.map((s) => s.total))}\n` +
    ` physics ${fmt(samples.map((s) => s.physics))}\n` +
    ` render  ${fmt(samples.map((s) => s.render))}`
  samples.length = 0
}
