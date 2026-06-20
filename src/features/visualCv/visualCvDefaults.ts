import type {
  VisualCvEnvelopeConfig,
  TriggeredCircleVisualCvRouting,
  VisualCvSmoothConfig,
  VisualCvSettings,
  VisualCvSyncSineConfig,
} from "./visualCvTypes"

export const defaultVisualCvSmoothConfig: VisualCvSmoothConfig = {
  input: "level",
  riseMs: 180,
  fallMs: 320,
}

export const defaultVisualCvEnvelopeConfig: VisualCvEnvelopeConfig = {
  threshold: 0.35,
  attackMs: 80,
  decayMs: 420,
  cooldownMs: 180,
}

export const defaultVisualCvSyncSineConfig: VisualCvSyncSineConfig = {
  input: "motion",
  threshold: 0.35,
  hysteresis: 0.08,
  cooldownMs: 160,
  lengthMultiple: 2,
  phaseMode: "peakOnSpike",
  syncMode: "soft",
  historyMs: 6000,
  periodSmoothMs: 300,
  phaseCorrectionAmount: 0.15,
}

export const defaultVisualCvSettings: VisualCvSettings = {
  smooth: defaultVisualCvSmoothConfig,
  envelope: defaultVisualCvEnvelopeConfig,
  syncSine: defaultVisualCvSyncSineConfig,
}

export const defaultTriggeredCircleRouting: TriggeredCircleVisualCvRouting = {
  triggerSource: "range",
  sizeSource: "level",
  growSource: "rise",
  releaseSource: "fall",
}
