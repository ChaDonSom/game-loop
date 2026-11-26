<script lang="ts">
/** Plain numbers for one frame of the track cue. Built in TouchControls.vue; this component reads nothing else. */
export type TrackCue = {
  /** Held, tangent mode, cue toggle on (or just released, while the fade runs). */
  visible: boolean
  /** 1 while held, 0 after release. The CSS transition (`--fade-ms`) fades between them. */
  fade: number
  /** Touch-down point, screen px. */
  origin: { x: number; y: number }
  /** Slider direction, unit. +x in track space. */
  dir: { x: number; y: number }
  /** Track reach to the minus and plus lock ends, px. */
  minus: number
  plus: number
  /** Finger position on the track now, px from the origin. */
  finger: number
  /** Where the wheels "want" to go (plan C), px on the track. `null` if the target mark is off. */
  target: { s: number; clamped: boolean } | null
}
</script>

<script setup lang="ts">
import { computed } from "vue"

// YOUR CHOICE: the whole cue look, this template and the scoped CSS below.
// Everything inside g.cue is in track space: x runs along the slider (px from the touch-down point), y across it.

const props = defineProps<{ cue: TrackCue }>()

const transform = computed(() => {
  const { origin, dir } = props.cue
  return `translate(${origin.x} ${origin.y}) rotate(${(Math.atan2(dir.y, dir.x) * 180) / Math.PI})`
})
/** +1 when the clamped target sits at the plus end, −1 at the minus end. The chevron points outward. */
const chevronSide = computed(() => Math.sign(props.cue.target?.s ?? 0) || 1)
</script>

<template>
  <!--
    svg.wheel-cue            full screen, pointer-events: none
      g.cue                  placed at the touch-down point, turned to the tangent
        line.track           the slider line, from -minus to +plus
        line.lock-tick       a tick at each lock end (.minus, .plus)
        circle.finger        where the finger is on the track now
        g.target             the "wheels want to go here" mark (plan C)
          path.target-tick     hollow tick, on the track
          path.target-chevron  shows instead when the target is past a track end
  -->
  <svg v-if="cue.visible" class="wheel-cue" :style="{ opacity: cue.fade }" aria-hidden="true">
    <g class="cue" :transform="transform">
      <line class="track" :x1="-cue.minus" y1="0" :x2="cue.plus" y2="0" />
      <line class="lock-tick minus" :x1="-cue.minus" y1="-6" :x2="-cue.minus" y2="6" />
      <line class="lock-tick plus" :x1="cue.plus" y1="-6" :x2="cue.plus" y2="6" />
      <circle class="finger" :transform="`translate(${cue.finger} 0)`" r="3" />
      <g v-if="cue.target" class="target" :transform="`translate(${cue.target.s} 0)`">
        <path v-if="!cue.target.clamped" class="target-tick" d="M -3 -7 L 3 -7 L 3 7 L -3 7 Z" />
        <path v-else class="target-chevron" :transform="`scale(${chevronSide} 1)`" d="M -2 -6 L 4 0 L -2 6" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.wheel-cue {
  --cue-color: #ffffff;
  --cue-opacity: 0.3;
  --track-width: 1px;
  --tick-length: 12px; /* the ticks in the template are 12 px; change both together */
  --fade-ms: 150ms; /* TouchControls keeps the cue mounted CUE_LINGER_MS (300 ms) after release */
  --target-color: #ffd166;

  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  transition: opacity var(--fade-ms) linear;
}
.track,
.lock-tick {
  stroke: var(--cue-color);
  stroke-opacity: var(--cue-opacity);
  stroke-width: var(--track-width);
}
.finger {
  fill: var(--cue-color);
  fill-opacity: calc(var(--cue-opacity) * 2);
}
.target-tick,
.target-chevron {
  fill: none;
  stroke: var(--target-color);
  stroke-width: 1.5px;
}
</style>
