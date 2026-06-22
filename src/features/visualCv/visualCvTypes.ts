export type VisualCvInputSignal = "level" | "rise" | "fall" | "motion"

export type VisualCvModulationSource =
  | VisualCvInputSignal
  | "smooth"
  | "envelope"
  | "syncSine"

export type VisualCvTriggerSource = "range" | "envelope" | "syncSine"

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

export type VisualCvSyncSinePhaseMode =
  | "peakOnSpike"
  | "zeroRisingOnSpike"
  | "troughOnSpike"
  | "zeroFallingOnSpike"

export type VisualCvSyncSineSyncMode = "soft" | "hard"

export type VisualCvSyncSineConfig = {
  input: VisualCvInputSignal
  threshold: number
  hysteresis: number
  cooldownMs: number
  lengthMultiple: number
  phaseMode: VisualCvSyncSinePhaseMode
  syncMode: VisualCvSyncSineSyncMode
  historyMs: number
  periodSmoothMs: number
  phaseCorrectionAmount: number
}

export type VisualCvSyncSineState = {
  phaseRadians: number
  timestamp: number
  armed: boolean
  lastTriggeredAt: number | null
  spikeTimes: number[]
  estimatedBasePeriodMs: number | null
  smoothedBasePeriodMs: number | null
  output: number
}

export type VisualCvUpdateResult<TState> = {
  raw: number
  output: number
  state: TState
}

export type VisualCvEnvelopeUpdateResult =
  VisualCvUpdateResult<VisualCvEnvelopeState> & {
    triggered: boolean
  }

export type VisualCvSyncSineUpdateResult =
  VisualCvUpdateResult<VisualCvSyncSineState> & {
    triggered: boolean
    cycleMs: number | null
  }

export type VisualCvSettings = {
  smooth: VisualCvSmoothConfig
  envelope: VisualCvEnvelopeConfig
  syncSine: VisualCvSyncSineConfig
}

export type TriggeredCircleVisualCvRouting = {
  triggerSource: VisualCvTriggerSource
  sizeSource: VisualCvModulationSource
  growSource: VisualCvModulationSource
  releaseSource: VisualCvModulationSource
}

export type VisualCvRouteSignal = {
  audioInstanceId: string
  timestamp: number
  level: number
  riseAmount: number
  fallAmount: number
  riseRate: number
  fallRate: number
  motion: number
  smooth: number
  envelope: number
  syncSine: number
  frequencyHz: number
  rangeTriggered: boolean
  envelopeTriggered: boolean
  syncSineTriggered: boolean
}
