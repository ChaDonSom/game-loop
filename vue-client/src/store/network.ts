import { computed, ref } from "vue"
import type { VehicleState } from "@game-loop/shared"

export interface PlayerSnapshot {
  x: number
  y: number
  time: number
}

/** Server vehicle state plus the `seq` of the message it came in and the local receive time. */
export type VehicleSnapshot = VehicleState & { seq: number; time: number }

export const myId = ref<string | null>(null)
/** Spawn slot the server gave this client in `welcome`. `null` until it arrives. */
export const mySpawnIndex = ref<number | null>(null)
export const myVisitorId = computed(() => myId.value)
export const connectionStatus = ref<"disconnected" | "connecting" | "connected">("disconnected")
export const serverCount = ref<number | null>(null)
export const remotePlayers = ref<Record<string, PlayerSnapshot[]>>({})
export const authoritativePlayers = ref<Record<string, VehicleSnapshot>>({})
/** Set when the server's world data differs from this page's. While set: no local prediction, no connection. */
export const worldMismatch = ref<{ server: string | null; client: string } | null>(null)
