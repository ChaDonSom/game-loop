import { ref } from "vue"
import { storedChoice } from "@/input/storedChoice"

/**
 * Screen orientation lock. The manifest says `"orientation": "any"`, so this stored choice does all the locking.
 *
 * `screen.orientation.lock` works only in an installed app or in fullscreen, and only on some browsers (Chrome on
 * Android). Desktop and iPhone Safari do not have it. Where it fails, the page turns with the device.
 */
export const orientationChoice = storedChoice("screenOrientation", ["landscape", "portrait"] as const, "landscape")

type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> }
const screenOrientation = screen.orientation as LockableOrientation | undefined

/** True if this browser has an orientation lock at all. */
export const canLockOrientation = typeof screenOrientation?.lock === "function"

const installedQuery = matchMedia("(display-mode: fullscreen), (display-mode: standalone)")
/** True when the page runs as an installed app (Add to Home Screen). */
export const isInstalledApp = ref(installedQuery.matches)
installedQuery.addEventListener("change", () => {
  isInstalledApp.value = installedQuery.matches
})

/** Locks to the stored choice. A refused lock (not installed, not fullscreen) leaves the page free to turn. */
export async function applyOrientation() {
  try {
    await screenOrientation?.lock?.(orientationChoice.value.value)
  } catch {
    // Refused: keep the current orientation.
  }
}

export function toggleOrientation() {
  orientationChoice.set(orientationChoice.value.value === "landscape" ? "portrait" : "landscape")
  void applyOrientation()
}

// The manifest no longer locks landscape, so an installed app locks itself at start.
if (isInstalledApp.value) void applyOrientation()
