/**
 * Frame-time readout for profiling on a real device. Off unless the page URL has `?perf`.
 * Shows, twice a second: frames per second, the frame interval, per-frame JS time split into physics and render
 * (avg / worst), draw calls and triangles, and seconds since load.
 *
 * The frame interval is the time between frames: at least 16.7 ms on a 60 Hz screen, even when all is well.
 * Interval minus JS is time spent elsewhere: GPU, compositing, or idle. If JS is small and the interval is long,
 * the GPU or compositor is the limit.
 *
 * A/B switches, for finding what costs the GPU (each works with or without `perf`):
 * - `noarc`: hide the gap arc.
 * - `noshadow`: turn shadows off.
 * - `dpr=1` (or 1.5, 2 …): render at this pixel ratio instead of min(devicePixelRatio, 2).
 * Example: `?perf&noshadow&dpr=1`.
 */
const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams()
const enabled = params.has("perf")
const dpr = Number(params.get("dpr"))

export const perfOptions = {
  noArc: params.has("noarc"),
  noShadow: params.has("noshadow"),
  /** Pixel ratio override, or null for the default. */
  pixelRatio: Number.isFinite(dpr) && dpr > 0 ? dpr : null,
}

type Sample = { interval: number; physics: number; render: number; total: number; calls: number; triangles: number }
const loadedAt = typeof performance !== "undefined" ? performance.now() : 0
const samples: Sample[] = []
let panel: HTMLDivElement | null = null
let lastReport = 0
let extra: (() => string) | null = null

/** One more line for the readout, read at each report. */
export function setPerfExtra(line: () => string) {
  extra = line
}

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
    ` render  ${fmt(samples.map((s) => s.render))}\n` +
    `draws    ${samples[samples.length - 1]!.calls}  tris ${samples[samples.length - 1]!.triangles}\n` +
    `t        ${((now - loadedAt) / 1000).toFixed(0)} s` +
    (extra ? `\n${extra()}` : "") +
    (perfOptions.noArc || perfOptions.noShadow || perfOptions.pixelRatio
      ? `\nab       ${[perfOptions.noArc && "noarc", perfOptions.noShadow && "noshadow", perfOptions.pixelRatio && `dpr=${perfOptions.pixelRatio}`].filter(Boolean).join(" ")}`
      : "")
  samples.length = 0
}
