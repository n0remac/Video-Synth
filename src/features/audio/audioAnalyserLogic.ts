import type { AudioAnalysisFrame } from "./audioAnalyserTypes"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function averageRange(values: Uint8Array, startRatio: number, endRatio: number) {
  const start = Math.floor(values.length * startRatio)
  const end = Math.max(start + 1, Math.floor(values.length * endRatio))
  let total = 0

  for (let index = start; index < end; index += 1) {
    total += values[index] ?? 0
  }

  return total / (end - start) / 255
}

export function getDominantBin(values: Uint8Array): number {
  let dominantBin = 0
  let dominantValue = -1

  values.forEach((value, index) => {
    if (value > dominantValue) {
      dominantValue = value
      dominantBin = index
    }
  })

  return dominantBin
}

export function normalizeSpectrum(values: Uint8Array, bucketCount: number) {
  const buckets = Math.max(1, Math.floor(bucketCount))
  const samplesPerBucket = Math.max(1, Math.floor(values.length / buckets))
  const spectrum: number[] = []

  for (let bucketIndex = 0; bucketIndex < buckets; bucketIndex += 1) {
    const start = bucketIndex * samplesPerBucket
    const end =
      bucketIndex === buckets - 1
        ? values.length
        : Math.min(values.length, start + samplesPerBucket)
    let total = 0

    for (let index = start; index < end; index += 1) {
      total += values[index] ?? 0
    }

    spectrum.push(clamp(total / Math.max(end - start, 1) / 255, 0, 1))
  }

  return spectrum
}

export function createAudioAnalysisFrame(
  frequencyData: Uint8Array,
  timestamp: number,
  bucketCount = 64,
): AudioAnalysisFrame {
  return {
    volume: averageRange(frequencyData, 0, 1),
    low: averageRange(frequencyData, 0.02, 0.16),
    mid: averageRange(frequencyData, 0.16, 0.48),
    high: averageRange(frequencyData, 0.48, 1),
    dominantBin: getDominantBin(frequencyData),
    spectrum: normalizeSpectrum(frequencyData, bucketCount),
    timestamp,
  }
}
