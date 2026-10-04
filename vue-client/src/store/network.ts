import { computed, ref } from "vue"

export interface PlayerSnapshot {
  x: number
  y: number
  time: number
}

export interface Vector3Snapshot {
  x: number
  y: number
  z: number
}

export interface RotationSnapshot {
  x: number
  y: number
  z: number
  w: number
}

export interface VehicleSnapshot {
  id: string
  seq: number
  ack: number
  position: Vector3Snapshot
  rotation: RotationSnapshot
  velocity: Vector3Snapshot
  time: number
}

export const myId = ref<string | null>(null)
export const myVisitorId = computed(() => myId.value)
export const connectionStatus = ref<"disconnected" | "connecting" | "connected">("disconnected")
export const serverCount = ref<number | null>(null)
export const remotePlayers = ref<Record<string, PlayerSnapshot[]>>({})
export const authoritativePlayers = ref<Record<string, VehicleSnapshot>>({})
