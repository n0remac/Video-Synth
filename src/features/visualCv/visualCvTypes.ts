export type VisualCvInputSignal = "level" | "rise" | "fall" | "motion"

export type VisualCvInputFrame = {
  timestamp: number
  level: number
  riseAmount: number
  fallAmount: number
  riseRate: number
  fallRate: number
}

export type VisualCvSmoothConfig = {
  input: VisualCvInputSignal
  riseMs: number
  fallMs: number
}

export type VisualCvSmoothState = {
  value: number
  timestamp: number
}

export type VisualCvEnvelopeConfig = {
  threshold: number
  attackMs: number
  decayMs: number
  cooldownMs: number
}

export type VisualCvEnvelopePhase = "idle" | "attack" | "decay"

export type VisualCvEnvelopeState = {
  phase: VisualCvEnvelopePhase
  phaseStartedAt: number
  previousTriggerValue: number
  lastTriggeredAt: number | null
  value: number
}

export type VisualCvUpdateResult<TState> = {
  raw: number
  output: number
  state: TState
}
