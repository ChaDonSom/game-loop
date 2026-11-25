<script setup lang="ts">
/**
 * Touch overlay: steering wheel (bottom left), brake and gas pedals (bottom right), gear pill above the pedals.
 * Pointer events feed `@/input/touch`. Per-frame visuals are written to the DOM in rAF, not through Vue state.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import keys from "@/input/keys"
import {
  EDGE_MARGIN,
  PEDAL_H_FRAC,
  PEDAL_W_FRAC,
  WHEEL_RADIUS_FRAC,
  gear,
  getPedal,
  getWheelAngle,
  grabWheel,
  longPressGear,
  moveWheel,
  pedalValue,
  releaseWheel,
  setPedal,
  tapGear,
  touchVisible,
  type PedalName,
} from "@/input/touch"

/** SLOT. Opacity of the wheel and pedals. */
const CONTROL_OPACITY = 0.75
const GEAR_IDLE_OPACITY = 0.45
const LONG_PRESS_MS = 600
const HIT_FRAC = 1.15

// ----------------------------------------------------
// #region MARK: Layout (recomputed on resize only)
// ----------------------------------------------------

const shortSide = ref(Math.min(window.innerWidth, window.innerHeight))
function onResize() {
  shortSide.value = Math.min(window.innerWidth, window.innerHeight)
}

const px = (n: number) => `${n}px`
const inset = (side: "left" | "right" | "bottom", n: number) => `calc(env(safe-area-inset-${side}) + ${n}px)`

const layout = computed(() => {
  const S = shortSide.value
  const R = S * WHEEL_RADIUS_FRAC
  const hitR = R * HIT_FRAC
  const pedalW = S * PEDAL_W_FRAC
  const pedalH = S * PEDAL_H_FRAC
  const gap = EDGE_MARGIN
  return {
    wheel: {
      width: px(hitR * 2),
      height: px(hitR * 2),
      left: inset("left", EDGE_MARGIN + R - hitR),
      bottom: inset("bottom", EDGE_MARGIN + R - hitR),
      opacity: CONTROL_OPACITY,
    },
    wheelSvg: { width: px(R * 2), height: px(R * 2) },
    gas: {
      width: px(pedalW),
      height: px(pedalH),
      right: inset("right", EDGE_MARGIN),
      bottom: inset("bottom", EDGE_MARGIN),
      opacity: CONTROL_OPACITY,
    },
    brake: {
      width: px(pedalW),
      height: px(pedalH),
      right: inset("right", EDGE_MARGIN + pedalW + gap),
      bottom: inset("bottom", EDGE_MARGIN),
      opacity: CONTROL_OPACITY,
    },
    gear: {
      width: px(pedalW * 2 + gap),
      right: inset("right", EDGE_MARGIN),
      bottom: inset("bottom", EDGE_MARGIN + pedalH + 8),
    },
  }
})

// ----------------------------------------------------
// #region MARK: Wheel pointer
// ----------------------------------------------------

const wheelEl = ref<HTMLElement | null>(null)
const wheelGroup = ref<SVGGElement | null>(null)
let wheelPointer: number | null = null
let wheelCenter = { x: 0, y: 0, radius: 1 }

function onWheelDown(e: PointerEvent) {
  if (wheelPointer !== null || !wheelEl.value) return
  const rect = wheelEl.value.getBoundingClientRect()
  const hitR = rect.width / 2
  const center = { x: rect.left + hitR, y: rect.top + hitR, radius: hitR / HIT_FRAC }
  const dx = e.clientX - center.x
  const dy = e.clientY - center.y
  if (Math.hypot(dx, dy) > hitR) return
  wheelEl.value.setPointerCapture(e.pointerId)
  wheelPointer = e.pointerId
  wheelCenter = center
  grabWheel(dx, dy, center.radius)
}

function onWheelMove(e: PointerEvent) {
  if (e.pointerId !== wheelPointer) return
  moveWheel(e.clientX - wheelCenter.x, e.clientY - wheelCenter.y, wheelCenter.radius)
}

function onWheelUp(e: PointerEvent) {
  if (e.pointerId !== wheelPointer) return
  wheelEl.value?.releasePointerCapture(e.pointerId)
  wheelPointer = null
  releaseWheel()
}

// ----------------------------------------------------
// #region MARK: Pedal pointers
// ----------------------------------------------------

const pedalEls = { throttle: ref<HTMLElement | null>(null), brake: ref<HTMLElement | null>(null) }
const pedalFills = { throttle: ref<HTMLElement | null>(null), brake: ref<HTMLElement | null>(null) }
const pedalPointers: Record<PedalName, { id: number; bottom: number; height: number } | null> = {
  throttle: null,
  brake: null,
}

function onPedalDown(name: PedalName, e: PointerEvent) {
  const el = pedalEls[name].value
  if (pedalPointers[name] || !el) return
  const rect = el.getBoundingClientRect()
  el.setPointerCapture(e.pointerId)
  pedalPointers[name] = { id: e.pointerId, bottom: rect.bottom, height: rect.height }
  setPedal(name, pedalValue(e.clientY, rect.bottom, rect.height))
}

function onPedalMove(name: PedalName, e: PointerEvent) {
  const held = pedalPointers[name]
  if (held?.id !== e.pointerId) return
  setPedal(name, pedalValue(e.clientY, held.bottom, held.height))
}

function onPedalUp(name: PedalName, e: PointerEvent) {
  if (pedalPointers[name]?.id !== e.pointerId) return
  pedalEls[name].value?.releasePointerCapture(e.pointerId)
  pedalPointers[name] = null
  setPedal(name, 0)
}

// ----------------------------------------------------
// #region MARK: Gear pill
// ----------------------------------------------------

let gearTimer: ReturnType<typeof setTimeout> | null = null
let gearLongFired = false
const gearPressed = ref(false)

function onGearDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  gearPressed.value = true
  gearLongFired = false
  gearTimer = setTimeout(() => {
    gearLongFired = true
    longPressGear()
  }, LONG_PRESS_MS)
}

function endGear(tap: boolean) {
  if (gearTimer) clearTimeout(gearTimer)
  gearTimer = null
  gearPressed.value = false
  if (tap && !gearLongFired) tapGear()
}

// ----------------------------------------------------
// #region MARK: Show / hide
// ----------------------------------------------------

const drivingKeys = new Set(Object.keys(keys))

function releaseAll() {
  wheelPointer = null
  releaseWheel()
  for (const name of ["throttle", "brake"] as const) {
    pedalPointers[name] = null
    setPedal(name, 0)
  }
  endGear(false)
}

function onAnyPointerDown(e: PointerEvent) {
  if (e.pointerType === "touch") touchVisible.value = true
}
function onKeyDown(e: KeyboardEvent) {
  if (drivingKeys.has(e.code)) touchVisible.value = false
}
function onGamepadConnected() {
  touchVisible.value = false
}

watch(touchVisible, (visible) => {
  if (!visible) releaseAll()
})

// ----------------------------------------------------
// #region MARK: Per-frame visuals
// ----------------------------------------------------

let frame = 0
function draw() {
  frame = requestAnimationFrame(draw)
  if (!touchVisible.value) return
  wheelGroup.value?.setAttribute("transform", `rotate(${(getWheelAngle() * 180) / Math.PI})`)
  for (const name of ["throttle", "brake"] as const) {
    const fill = pedalFills[name].value
    if (fill) fill.style.height = `${getPedal(name) * 100}%`
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", onAnyPointerDown, { capture: true })
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("gamepadconnected", onGamepadConnected)
  window.addEventListener("resize", onResize)
  window.addEventListener("orientationchange", onResize)
  frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onAnyPointerDown, { capture: true })
  window.removeEventListener("keydown", onKeyDown)
  window.removeEventListener("gamepadconnected", onGamepadConnected)
  window.removeEventListener("resize", onResize)
  window.removeEventListener("orientationchange", onResize)
  cancelAnimationFrame(frame)
  if (gearTimer) clearTimeout(gearTimer)
})

const throttleEl = pedalEls.throttle
const brakeEl = pedalEls.brake
const throttleFill = pedalFills.throttle
const brakeFill = pedalFills.brake
</script>

<template>
  <div v-show="touchVisible" class="touch-root" @contextmenu.prevent>
    <div
      ref="wheelEl"
      class="control wheel"
      :style="layout.wheel"
      @pointerdown="onWheelDown"
      @pointermove="onWheelMove"
      @pointerup="onWheelUp"
      @pointercancel="onWheelUp"
    >
      <svg viewBox="-1 -1 2 2" :style="layout.wheelSvg" aria-hidden="true">
        <g ref="wheelGroup">
          <circle r="0.86" fill="none" stroke="#1d1d22" stroke-width="0.2" />
          <circle r="0.86" fill="none" stroke="#e8e8ec" stroke-width="0.08" />
          <g stroke="#e8e8ec" stroke-width="0.12" stroke-linecap="round">
            <line x1="0.2" y1="0" x2="0.8" y2="0" />
            <line x1="-0.2" y1="0" x2="-0.8" y2="0" />
            <line x1="0" y1="0.2" x2="0" y2="0.8" />
          </g>
          <circle r="0.22" fill="#1d1d22" stroke="#e8e8ec" stroke-width="0.06" />
          <rect x="-0.06" y="-0.98" width="0.12" height="0.24" rx="0.03" fill="#ff8a1f" />
        </g>
      </svg>
    </div>

    <div
      ref="brakeEl"
      class="control pedal"
      :style="layout.brake"
      @pointerdown="onPedalDown('brake', $event)"
      @pointermove="onPedalMove('brake', $event)"
      @pointerup="onPedalUp('brake', $event)"
      @pointercancel="onPedalUp('brake', $event)"
    >
      <div ref="brakeFill" class="fill brake-fill" />
      <span class="label">BRAKE</span>
    </div>

    <div
      ref="throttleEl"
      class="control pedal"
      :style="layout.gas"
      @pointerdown="onPedalDown('throttle', $event)"
      @pointermove="onPedalMove('throttle', $event)"
      @pointerup="onPedalUp('throttle', $event)"
      @pointercancel="onPedalUp('throttle', $event)"
    >
      <div ref="throttleFill" class="fill gas-fill" />
      <span class="label">GAS</span>
    </div>

    <div
      class="control gear"
      :style="{ ...layout.gear, opacity: gearPressed ? CONTROL_OPACITY : GEAR_IDLE_OPACITY }"
      @pointerdown="onGearDown"
      @pointerup="endGear(true)"
      @pointercancel="endGear(false)"
    >
      <span class="chip">{{ gear }}</span>
    </div>
  </div>
</template>

<style scoped>
.touch-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}
.control {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.wheel {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.wheel svg {
  display: block;
  overflow: visible;
}
.pedal {
  box-sizing: border-box;
  border: 2px solid rgba(232, 232, 236, 0.8);
  border-radius: 10px;
  background: rgba(29, 29, 34, 0.35);
  overflow: hidden;
}
.fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
}
.gas-fill {
  background: rgba(88, 196, 120, 0.85);
}
.brake-fill {
  background: rgba(230, 80, 70, 0.85);
}
.label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  text-align: center;
  font:
    600 11px/1 system-ui,
    sans-serif;
  letter-spacing: 0.08em;
  color: #e8e8ec;
}
.gear {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chip {
  white-space: nowrap;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(29, 29, 34, 0.7);
  border: 1px solid rgba(232, 232, 236, 0.8);
  color: #e8e8ec;
  font:
    600 12px/1 system-ui,
    sans-serif;
  letter-spacing: 0.08em;
}
</style>
