import { ref, type Ref } from "vue"

/**
 * A setting saved in `localStorage`, as a ref plus a setter. Storage can be blocked (private mode, previews): then
 * the default is used and a change lasts for this page only.
 */
export function storedChoice<T extends string>(key: string, choices: readonly T[], fallback: T) {
  const value = ref(load()) as Ref<T>

  function load(): T {
    try {
      const saved = localStorage.getItem(key)
      if (saved !== null && (choices as readonly string[]).includes(saved)) return saved as T
    } catch {
      // Storage blocked: use the default.
    }
    return fallback
  }

  function set(next: T) {
    value.value = next
    try {
      localStorage.setItem(key, next)
    } catch {
      // Storage blocked: keep the choice for this page only.
    }
  }

  return { value, set }
}

/** A number setting saved in `localStorage`, clamped to [min, max]. Same storage rules as `storedChoice`. */
export function storedNumber(key: string, fallback: number, min: number, max: number) {
  const clampValue = (n: number) => Math.min(max, Math.max(min, n))
  const value = ref(load())

  function load(): number {
    try {
      const saved = Number(localStorage.getItem(key))
      if (localStorage.getItem(key) !== null && Number.isFinite(saved)) return clampValue(saved)
    } catch {
      // Storage blocked: use the default.
    }
    return fallback
  }

  function set(next: number) {
    value.value = clampValue(next)
    try {
      localStorage.setItem(key, String(value.value))
    } catch {
      // Storage blocked: keep the value for this page only.
    }
  }

  return { value, set, min, max }
}
