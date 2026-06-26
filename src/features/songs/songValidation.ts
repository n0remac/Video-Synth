import {
  songAnalysisBucketCount,
  songAnalysisFftSize,
  songAnalysisRateHz,
  songAnalysisVersion,
  type SongAnalysis,
  type SongMetadata,
} from "./songTypes.ts"


export function isSongId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

export function normalizeSongId(value: unknown) {
  return isSongId(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNormalized(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isNormalizedArray(value: unknown, length?: number): value is number[] {
  return (
    Array.isArray(value) &&
    (length === undefined || value.length === length) &&
    value.every(isNormalized)
  )
}

export function isAudioMimeType(value: string) {
  return value.startsWith("audio/")
}

export function isSongMetadata(value: unknown): value is SongMetadata {
  return (
    isRecord(value) &&
    isSongId(value.id) &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    typeof value.originalFileName === "string" &&
    typeof value.audioFileName === "string" &&
    typeof value.mimeType === "string" &&
    isAudioMimeType(value.mimeType) &&
    isFiniteNumber(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.durationMs === undefined ||
      (isFiniteNumber(value.durationMs) && value.durationMs >= 0))
  )
}

export function isSongAnalysis(value: unknown): value is SongAnalysis {
  if (!isRecord(value) || value.version !== songAnalysisVersion) {
    return false
  }

  const normalization = value.normalization

  return (
    isSongId(value.songId) &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs >= 0 &&
    isFiniteNumber(value.sampleRate) &&
    value.sampleRate > 0 &&
    isFiniteNumber(value.channelCount) &&
    value.channelCount > 0 &&
    value.fftSize === songAnalysisFftSize &&
    isFiniteNumber(value.hopSize) &&
    value.hopSize > 0 &&
    value.analysisRateHz === songAnalysisRateHz &&
    value.bucketCount === songAnalysisBucketCount &&
    value.windowFunction === "hann" &&
    isRecord(normalization) &&
    isNormalized(normalization.volumePeak) &&
    isNormalized(normalization.lowPeak) &&
    isNormalized(normalization.midPeak) &&
    isNormalized(normalization.highPeak) &&
    Array.isArray(value.frames) &&
    value.frames.every(
      (frame) =>
        isRecord(frame) &&
        isFiniteNumber(frame.timeMs) &&
        frame.timeMs >= 0 &&
        isNormalized(frame.volume) &&
        isNormalized(frame.low) &&
        isNormalized(frame.mid) &&
        isNormalized(frame.high) &&
        isFiniteNumber(frame.dominantBin) &&
        isNormalizedArray(frame.spectrum, songAnalysisBucketCount) &&
        isNormalizedArray(frame.controlSpectrum, songAnalysisBucketCount) &&
        isRecord(frame.wledAudio) &&
        isNormalized(frame.wledAudio.volume) &&
        isNormalizedArray(frame.wledAudio.bands, 16) &&
        isFiniteNumber(frame.wledAudio.dominantFrequencyHz) &&
        frame.wledAudio.dominantFrequencyHz >= 0,
    )
  )
}
