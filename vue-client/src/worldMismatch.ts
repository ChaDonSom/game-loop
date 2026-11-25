import { WORLD_VERSION } from "@game-loop/shared"
import { worldMismatch } from "@/store/network"

/**
 * Runs when the server's world data differs from this page's (or the server sends no version).
 * `serverVersion` is null for a server older than the check.
 */
export function handleWorldMismatch(serverVersion: string | null) {
  // Fixed rule 1 (not a choice): stop predicting and stop sending controls.
  // Setting this freezes the local simulation (soapbox-init.ts) and the controls sender (network.ts).
  worldMismatch.value = { server: serverVersion, client: WORLD_VERSION }

  // YOUR CHOICE: what happens next for the player. Look at reloadOncePerVersion below, and at the
  // notice in App.vue (it shows while worldMismatch is set). Use one, both, or something else.
  // Fixed rule 2: never call location.reload() directly. A stale cached page would reload forever.
  // Placeholder: notice only.
}

const RELOAD_KEY = "game-loop:reloaded-for-world"

/**
 * Reloads the page once per server version. Returns false if this tab already reloaded for that version
 * (so the page is still stale after a reload) or storage is blocked.
 */
export function reloadOncePerVersion(serverVersion: string | null) {
  const marker = serverVersion ?? "unknown"
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === marker) return false
    sessionStorage.setItem(RELOAD_KEY, marker)
  } catch {
    return false
  }
  location.reload()
  return true
}
