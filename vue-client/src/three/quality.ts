/**
 * Render quality: a ladder of settings from sharpest to cheapest, and an auto mode that steps down it when frames
 * run long. The cost on slow devices is pixels and shadows, not triangles (see the `?perf` readout).
 *
 * Auto never steps up by itself: at 60 Hz the frame interval cannot show spare time, so a step up would be a guess
 * and could flip back and forth. Pick High, then Auto again, to start Auto from the top.
 */
import * as THREE from "three"
import { ref } from "vue"
import { storedChoice, storedNumber } from "@/input/storedChoice.ts"
import { perfOptions } from "@/debug/perfHud"

// ----------------------------------------------------
// #region MARK: Slots
// ----------------------------------------------------

/**
 * YOUR CHOICE: average frame interval (ms) that counts as "too slow". 16.7 ms is 60 fps; a little above it leaves
 * room for the odd late frame. Lower = steps down sooner. Drive near the oval on the Chromebook and watch `?perf`.
 */
export const STEP_DOWN_MS = 18.5
/** YOUR CHOICE: how long (s) the average must stay too slow before a step down. Short = reacts to a single hitch. */
export const STEP_DOWN_WINDOW_S = 2
/** No judging for this long after load or after a change: shaders compile and the first frames are slow. */
const SETTLE_S = 3
/** Intervals longer than this are a hidden tab or a stall, not rendering cost: ignored. */
const MAX_COUNTED_INTERVAL_MS = 250

type Level = { pixelRatio: number; shadowMapSize: number; shadows: boolean }

/** Sharpest first. Rungs that match the one before (for example on a 1× screen) are dropped. */
function buildLadder(): Level[] {
  const full = Math.min(window.devicePixelRatio, 2)
  const rungs: Level[] = [
    { pixelRatio: full, shadowMapSize: 2048, shadows: true },
    { pixelRatio: full, shadowMapSize: 1024, shadows: true },
    { pixelRatio: Math.max(1, full - 0.5), shadowMapSize: 1024, shadows: true },
    { pixelRatio: 1, shadowMapSize: 1024, shadows: true },
    { pixelRatio: 1, shadowMapSize: 1024, shadows: false },
  ]
  return rungs.filter((r, i) => {
    const prev = rungs[i - 1]
    return !prev || prev.pixelRatio !== r.pixelRatio || prev.shadowMapSize !== r.shadowMapSize || prev.shadows !== r.shadows
  })
}

// ----------------------------------------------------
// #region MARK: State (the status bar pill reads and sets it)
// ----------------------------------------------------

export type QualityMode = "auto" | "high" | "low"
export const qualitySetting = storedChoice<QualityMode>("renderQuality", ["auto", "high", "low"], "auto")
/** Rung Auto has reached, saved so a slow device does not start at the top on every load. */
const autoLevel = storedNumber("renderAutoLevel", 0, 0, 10)
/** Rung in use, 0 = sharpest. */
export const qualityLevel = ref(0)
/** `?dpr` or `?noshadow` in the URL: the A/B switches win, and Auto stays off. */
export const qualityOverridden = perfOptions.pixelRatio !== null || perfOptions.noShadow

/** High → Low → Auto → High. Choosing Auto starts it from the top again. */
export function cycleQuality() {
  const next: QualityMode = qualitySetting.value.value === "high" ? "low" : qualitySetting.value.value === "low" ? "auto" : "high"
  if (next === "auto") autoLevel.set(0)
  qualitySetting.set(next)
}

// ----------------------------------------------------
// #region MARK: Controller
// ----------------------------------------------------

export function initQuality(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sun: THREE.DirectionalLight) {
  const ladder = buildLadder()
  let applied: Level | null = null
  let settleUntil = performance.now() + SETTLE_S * 1000
  let windowStart = performance.now()
  let windowSum = 0
  let windowCount = 0

  function levelFor(mode: QualityMode) {
    if (mode === "high") return 0
    if (mode === "low") return ladder.length - 1
    return Math.min(autoLevel.value.value, ladder.length - 1)
  }

  function apply(index: number) {
    qualityLevel.value = index
    if (qualityOverridden) return
    const level = ladder[index]!
    if (!applied || applied.pixelRatio !== level.pixelRatio) renderer.setPixelRatio(level.pixelRatio)
    if (!applied || applied.shadowMapSize !== level.shadowMapSize) {
      sun.shadow.mapSize.set(level.shadowMapSize, level.shadowMapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    if (!applied || applied.shadows !== level.shadows) {
      renderer.shadowMap.enabled = level.shadows
      // Materials compile shadow code in or out: they must rebuild.
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material
        for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
      })
    }
    applied = level
    settleUntil = performance.now() + SETTLE_S * 1000
  }

  apply(levelFor(qualitySetting.value.value))

  return {
    /** Re-read the setting (call when the pill changes it). */
    sync() {
      apply(levelFor(qualitySetting.value.value))
    },
    /** Call once per frame with the frame interval, ms. */
    frame(intervalMs: number) {
      if (qualityOverridden || qualitySetting.value.value !== "auto") return
      const now = performance.now()
      if (now < settleUntil) {
        windowStart = now
        windowSum = 0
        windowCount = 0
        return
      }
      if (intervalMs <= MAX_COUNTED_INTERVAL_MS) {
        windowSum += intervalMs
        windowCount++
      }
      if (now - windowStart < STEP_DOWN_WINDOW_S * 1000) return
      const average = windowCount > 0 ? windowSum / windowCount : 0
      windowStart = now
      windowSum = 0
      windowCount = 0
      if (average > STEP_DOWN_MS && qualityLevel.value < ladder.length - 1) {
        autoLevel.set(qualityLevel.value + 1)
        apply(qualityLevel.value + 1)
      }
    },
    /** For the `?perf` readout. */
    describe() {
      const level = ladder[qualityLevel.value]!
      const mode = qualityOverridden ? "url" : qualitySetting.value.value
      return `${mode} ${qualityLevel.value}/${ladder.length - 1}: dpr ${level.pixelRatio} shadow ${level.shadows ? level.shadowMapSize : "off"}`
    },
  }
}
