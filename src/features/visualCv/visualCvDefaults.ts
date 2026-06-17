import type {
  VisualCvEnvelopeConfig,
  VisualCvSmoothConfig,
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
