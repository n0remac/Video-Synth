import type { WledAudioFrame } from "@/features/network/protocolTypes"

export const wledFrequencyRangesHz = [
  [43, 86],
  [86, 129],
  [129, 216],
  [216, 301],
  [301, 430],
  [430, 560],
  [560, 818],
  [818, 1076],
  [1076, 1421],
  [1421, 1895],
  [1895, 2412],
  [2412, 3187],
  [3187, 4210],
  [4210, 5598],
  [5598, 7106],
  [7106, 8828],
] as const

const displayMinDb = -90
const displayMaxDb = -25

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeMagnitude(magnitude: number, fftSize: number) {
  const scaledMagnitude = magnitude / Math.max(fftSize / 2, 1)
  const decibels = 20 * Math.log10(scaledMagnitude + 0.00000001)

  return clamp(
    (decibels - displayMinDb) / (displayMaxDb - displayMinDb),
    0,
    1,
  )
}

function createBands(
  binCount: number,
  sampleRate: number,
  fftSize: number,
  getValue: (index: number) => number,
) {
  return wledFrequencyRangesHz.map(([minimumHz, maximumHz], bandIndex) => {
    let total = 0
    let samples = 0

    for (let index = 1; index < binCount; index += 1) {
      const frequencyHz = (index * sampleRate) / fftSize
      const insideBand =
        frequencyHz >= minimumHz &&
        (bandIndex === wledFrequencyRangesHz.length - 1
          ? frequencyHz <= maximumHz
          : frequencyHz < maximumHz)

      if (insideBand) {
        total += getValue(index)
        samples += 1
      }
    }

    return samples > 0 ? clamp(total / samples, 0, 1) : 0
  }) as WledAudioFrame["bands"]
}

function getDominantFrequency(
  binCount: number,
  sampleRate: number,
  fftSize: number,
  getMagnitude: (index: number) => number,
) {
  let dominantIndex = 0
  let dominantMagnitude = 0

  for (let index = 1; index < binCount; index += 1) {
    const magnitude = getMagnitude(index)

    if (magnitude > dominantMagnitude) {
      dominantIndex = index
      dominantMagnitude = magnitude
    }
  }

  return dominantIndex > 0 ? (dominantIndex * sampleRate) / fftSize : 0
}

export function calculateRms(samples: ArrayLike<number>) {
  if (samples.length === 0) {
    return 0
  }

  let sumSquares = 0

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0
    sumSquares += sample * sample
  }

  return clamp(Math.sqrt(sumSquares / samples.length), 0, 1)
}

export function createWledAudioFromComplexSpectrum({
  fftSize,
  imag,
  real,
  rmsVolume,
  sampleRate,
}: {
  fftSize: number
  imag: ArrayLike<number>
  real: ArrayLike<number>
  rmsVolume: number
  sampleRate: number
}): WledAudioFrame {
  const binCount = Math.min(
    Math.floor(fftSize / 2),
    real.length,
    imag.length,
  )
  const getMagnitude = (index: number) =>
    Math.hypot(real[index] ?? 0, imag[index] ?? 0)
  const getNormalizedValue = (index: number) =>
    normalizeMagnitude(getMagnitude(index), fftSize)

  return {
    volume: clamp(rmsVolume, 0, 1),
    bands: createBands(binCount, sampleRate, fftSize, getNormalizedValue),
    dominantFrequencyHz: getDominantFrequency(
      binCount,
      sampleRate,
      fftSize,
      getMagnitude,
    ),
  }
}

export function createWledAudioFromByteFrequencyData({
  fftSize,
  frequencyData,
  rmsVolume,
  sampleRate,
}: {
  fftSize: number
  frequencyData: Uint8Array
  rmsVolume: number
  sampleRate: number
}): WledAudioFrame {
  const getValue = (index: number) =>
    clamp((frequencyData[index] ?? 0) / 255, 0, 1)

  return {
    volume: clamp(rmsVolume, 0, 1),
    bands: createBands(
      frequencyData.length,
      sampleRate,
      fftSize,
      getValue,
    ),
    dominantFrequencyHz: getDominantFrequency(
      frequencyData.length,
      sampleRate,
      fftSize,
      getValue,
    ),
  }
}
