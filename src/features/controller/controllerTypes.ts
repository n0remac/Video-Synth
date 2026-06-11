export type ControllerState = {
  userId: string
  color: string
  connected: boolean
  pointerDown: boolean
  lastPointer?: {
    x: number
    y: number
    timestamp: number
  }
  intensity: number
}

export type NormalizedPointer = {
  x: number
  y: number
}

export type PointerVelocity = {
  vx: number
  vy: number
  speed: number
}
