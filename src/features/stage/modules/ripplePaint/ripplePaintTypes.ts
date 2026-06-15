export type RippleAudioMotion = {
  audioInstanceId: string
  growOnRise: boolean
  fadeOnFall: boolean
  shrinkOnFall: boolean
  levelControlsSize: boolean
  phase: "rising" | "falling"
  hasRisen: boolean
  signalAge: number
  riseAmount: number
  fallAmount: number
  level: number
  peakRadius: number
}

export type Ripple = {
  id: string
  userId: string
  x: number
  y: number
  radius: number
  maxRadius: number
  opacity: number
  age: number
  lifetime: number
  color: string
  audioMotion?: RippleAudioMotion
}

export type RippleInput = {
  id: string
  userId: string
  x: number
  y: number
  speed: number
  color: string
  intensity?: number
  audioMotion?: {
    audioInstanceId: string
    growOnRise: boolean
    fadeOnFall: boolean
    shrinkOnFall: boolean
    levelControlsSize: boolean
    level: number
    riseAmount: number
    fallAmount: number
  }
}

export type RipplePaintState = {
  ripples: Ripple[]
}
