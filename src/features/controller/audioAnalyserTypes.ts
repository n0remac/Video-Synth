export type AudioAnalyserStatus =
  | "idle"
  | "requesting"
  | "running"
  | "error"
  | "not-supported"

export type AudioAnalysisFrame = {
  volume: number
  low: number
  mid: number
  high: number
  dominantBin: number
  spectrum: number[]
  timestamp: number
}
