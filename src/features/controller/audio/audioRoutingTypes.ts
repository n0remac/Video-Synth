export type AudioRouteTargetKind =
  | "controller-x"
  | "controller-y"
  | "trigger-circle"
  | "emit-line"
  | "background-brightness"
  | "user-color-brightness"
  | "all-users-color-brightness"
  | "audio-controller-color-brightness"

export type AudioRoute = {
  id: string
  enabled: boolean
  name: string
  sampleStartPercent: number
  sampleEndPercent: number
  gain: number
  threshold: number
  smoothing: number
  invert: boolean
  targetKind: AudioRouteTargetKind
  targetId: string
  color: string
  lastValue: number
  triggerActive: boolean
  lastSentAt: number
}

export type AudioVirtualController = {
  id: string
  label: string
  color: string
  visualMode: "circle" | "line"
  x: number
  y: number
  active: boolean
  lastSentAt: number
  previousX: number
  previousY: number
  trailLineCount: number
  trailLength: number
}
