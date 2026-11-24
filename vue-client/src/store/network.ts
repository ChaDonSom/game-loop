import { computed, ref } from "vue"
import type { Quaternion, Vector3 } from "@game-loop/shared"

export interface PlayerSnapshot {
  x: number
  y: number
  time: number
}

export interface VehicleSnapshot {
  id: string
  seq: number
  ack: number
  position: Vector3
  rotation: Quaternion
  velocity: Vector3
  steering: number
  time: number
}

export const myId = ref<string | null>(null)
/** Spawn slot the server gave this client in `welcome`. `null` until it arrives. */
export const mySpawnIndex = ref<number | null>(null)
export const myVisitorId = computed(() => myId.value)
export const connectionStatus = ref<"disconnected" | "connecting" | "connected">("disconnected")
export const serverCount = ref<number | null>(null)
export const remotePlayers = ref<Record<string, PlayerSnapshot[]>>({})
export const authoritativePlayers = ref<Record<string, VehicleSnapshot>>({})
