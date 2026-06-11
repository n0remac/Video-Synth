import type { AudioAnalysisFrame } from "@/features/network/protocolTypes"

export type AudioAnalyserStatus =
  | "idle"
  | "requesting"
  | "running"
  | "error"
  | "not-supported"

export type { AudioAnalysisFrame }
