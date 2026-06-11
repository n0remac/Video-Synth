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
}

export type RippleInput = {
  id: string
  userId: string
  x: number
  y: number
  speed: number
  color: string
  intensity?: number
}

export type RipplePaintState = {
  ripples: Ripple[]
}
