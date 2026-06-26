import type { WledAudioFrame } from "@/features/network/protocolTypes"

export const songAnalysisVersion = 2
export const songAnalysisFftSize = 2048
export const songAnalysisRateHz = 60
export const songAnalysisBucketCount = 64
export const maxSongUploadBytes = 100 * 1024 * 1024
export const maxSongScanDurationMs = 12 * 60 * 1000

export type SongMetadata = {
  id: string
  title: string
  originalFileName: string
  audioFileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  durationMs?: number
}

export type SongSummary = SongMetadata & {
  hasAnalysis: boolean
}

export type SongScanState = {
  songId: string
  status: "decoding" | "analyzing" | "saving"
}

export type SongAnalysisFrame = {
  timeMs: number
  volume: number
  low: number
  mid: number
  high: number
  dominantBin: number
  spectrum: number[]
  controlSpectrum: number[]
  wledAudio: WledAudioFrame
}

export type SongAnalysis = {
  version: 2
  songId: string
  durationMs: number
  sampleRate: number
  channelCount: number
  fftSize: number
  hopSize: number
  analysisRateHz: number
  bucketCount: number
  windowFunction: "hann"
  normalization: {
    volumePeak: number
    lowPeak: number
    midPeak: number
    highPeak: number
  }
  frames: SongAnalysisFrame[]
}

export type SongPeakBand = "volume" | "low" | "mid" | "high"
