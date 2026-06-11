export type SignalName =
  | "pointer.position"
  | "pointer.speed"
  | "pointer.velocity"
  | "user.color"
  | "time.elapsed"
  | "time.delta"

export type ParameterName =
  | "ripple.position"
  | "ripple.radius"
  | "ripple.color"
  | "ripple.opacity"

export type PatchConnection = {
  from: SignalName
  to: ParameterName
  amount?: number
  enabled?: boolean
}

export type PatchDefinition = {
  id: string
  name: string
  connections: PatchConnection[]
}
