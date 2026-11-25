type Pad = {
  connected: boolean
  steer: number
  throttle: number
  brake: number
  /** Gear. `undefined` = auto (brake reverses after a stop). `false` = manual D. `true` = manual R. */
  reverse?: boolean
}
type Keys = { [key: string]: boolean }

export type { Pad, Keys }
