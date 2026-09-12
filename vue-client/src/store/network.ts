import { computed, ref } from "vue"

export interface PlayerSnapshot {
  x: number
  y: number
  time: number
}

export const myId = ref<string | null>(null)
export const myVisitorId = computed(() => myId.value)
export const connectionStatus = ref<"disconnected" | "connecting" | "connected">("disconnected")
export const serverCount = ref<number | null>(null)
export const remotePlayers = ref<Record<string, PlayerSnapshot[]>>({})
