import type {
  SongAnalysis,
  SongAnalysisFrame,
  SongPeakBand,
} from "./songTypes"
import {
  songAnalysisBucketCount,
  songAnalysisFftSize,
  songAnalysisRateHz,
  songAnalysisVersion,
} from "./songTypes.ts"
import {
  calculateRms,
  createWledAudioFromComplexSpectrum,
} from "../audio/wledAudioFeatures.ts"

const displayMinDb = -90
const displayMaxDb = -25
const spectrumSmoothing = 0.82

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function averageRange(values: number[], startRatio: number, endRatio: number) {
  if (values.length === 0) {
    return 0
  }

  const start = Math.floor(values.length * startRatio)
  const end = Math.max(start + 1, Math.floor(values.length * endRatio))
  let total = 0

  for (let index = start; index < Math.min(end, values.length); index += 1) {
    total += values[index] ?? 0
  }

  return total / Math.max(Math.min(end, values.length) - start, 1)
}

function getDominantBin(values: number[]) {
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

function createHannWindow(size: number) {
  const values = new Float32Array(size)

  for (let index = 0; index < size; index += 1) {
    values[index] = 0.5 * (1 - Math.cos((Math.PI * 2 * index) / (size - 1)))
  }

  return values
}

function fft(real: Float32Array, imag: Float32Array) {
  const size = real.length

  for (let index = 1, swapIndex = 0; index < size; index += 1) {
    let bit = size >> 1

    for (; swapIndex & bit; bit >>= 1) {
      swapIndex ^= bit
    }

    swapIndex ^= bit

    if (index < swapIndex) {
      const realValue = real[index] ?? 0
      const imagValue = imag[index] ?? 0

      real[index] = real[swapIndex] ?? 0
      imag[index] = imag[swapIndex] ?? 0
      real[swapIndex] = realValue
      imag[swapIndex] = imagValue
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-Math.PI * 2) / length
    const stepReal = Math.cos(angle)
    const stepImag = Math.sin(angle)

    for (let offset = 0; offset < size; offset += length) {
      let currentReal = 1
      let currentImag = 0

      for (let index = 0; index < length / 2; index += 1) {
        const evenIndex = offset + index
        const oddIndex = evenIndex + length / 2
        const oddReal =
          (real[oddIndex] ?? 0) * currentReal -
          (imag[oddIndex] ?? 0) * currentImag
        const oddImag =
          (real[oddIndex] ?? 0) * currentImag +
          (imag[oddIndex] ?? 0) * currentReal

        real[oddIndex] = (real[evenIndex] ?? 0) - oddReal
        imag[oddIndex] = (imag[evenIndex] ?? 0) - oddImag
        real[evenIndex] = (real[evenIndex] ?? 0) + oddReal
        imag[evenIndex] = (imag[evenIndex] ?? 0) + oddImag

        const nextReal = currentReal * stepReal - currentImag * stepImag
        currentImag = currentReal * stepImag + currentImag * stepReal
        currentReal = nextReal
      }
    }
  }
}

function normalizeSpectrumBins(
  real: Float32Array,
  imag: Float32Array,
  bucketCount: number,
  previousSpectrum: number[] | null,
) {
  const binCount = real.length / 2
  const samplesPerBucket = Math.max(1, Math.floor(binCount / bucketCount))
  const spectrum: number[] = []
  const controlSpectrum: number[] = []

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * samplesPerBucket
    const end =
      bucketIndex === bucketCount - 1
        ? binCount
        : Math.min(binCount, start + samplesPerBucket)
    let total = 0

    for (let index = start; index < end; index += 1) {
      const magnitude =
        Math.hypot(real[index] ?? 0, imag[index] ?? 0) / (songAnalysisFftSize / 2)
      const db = 20 * Math.log10(magnitude + 0.00000001)
      const normalized = clamp(
        (db - displayMinDb) / (displayMaxDb - displayMinDb),
        0,
        1,
      )

      total += normalized
    }

    const value = clamp(total / Math.max(end - start, 1), 0, 1)
    const previousValue = previousSpectrum?.[bucketIndex] ?? value
    const smoothedValue =
      previousValue * spectrumSmoothing + value * (1 - spectrumSmoothing)

    controlSpectrum.push(value)
    spectrum.push(clamp(smoothedValue, 0, 1))
  }

  return { spectrum, controlSpectrum }
}

export function analyzeMonoSamples({
  channelCount,
  durationMs,
  samples,
  sampleRate,
  songId,
}: {
  channelCount: number
  durationMs: number
  samples: Float32Array
  sampleRate: number
  songId: string
}): SongAnalysis {
  const hopSize = Math.max(1, Math.round(sampleRate / songAnalysisRateHz))
  const window = createHannWindow(songAnalysisFftSize)
  const real = new Float32Array(songAnalysisFftSize)
  const imag = new Float32Array(songAnalysisFftSize)
  const frames: SongAnalysisFrame[] = []
  let previousSpectrum: number[] | null = null
  let volumePeak = 0
  let lowPeak = 0
  let midPeak = 0
  let highPeak = 0

  for (
    let startSample = 0;
    startSample + songAnalysisFftSize <= samples.length;
    startSample += hopSize
  ) {
    const timeDomainSamples = new Float32Array(songAnalysisFftSize)

    for (let index = 0; index < songAnalysisFftSize; index += 1) {
      const sample = samples[startSample + index] ?? 0

      timeDomainSamples[index] = sample
      real[index] = sample * (window[index] ?? 0)
      imag[index] = 0
    }

    fft(real, imag)

    const { spectrum, controlSpectrum } = normalizeSpectrumBins(
      real,
      imag,
      songAnalysisBucketCount,
      previousSpectrum,
    )
    previousSpectrum = spectrum

    const frame = {
      timeMs: (startSample / sampleRate) * 1000,
      volume: averageRange(spectrum, 0, 1),
      low: averageRange(spectrum, 0.02, 0.16),
      mid: averageRange(spectrum, 0.16, 0.48),
      high: averageRange(spectrum, 0.48, 1),
      dominantBin: getDominantBin(spectrum),
      spectrum,
      controlSpectrum,
      wledAudio: createWledAudioFromComplexSpectrum({
        fftSize: songAnalysisFftSize,
        imag,
        real,
        rmsVolume: calculateRms(timeDomainSamples),
        sampleRate,
      }),
    }

    volumePeak = Math.max(volumePeak, frame.volume)
    lowPeak = Math.max(lowPeak, frame.low)
    midPeak = Math.max(midPeak, frame.mid)
    highPeak = Math.max(highPeak, frame.high)
    frames.push(frame)
  }

  return {
    version: songAnalysisVersion,
    songId,
    durationMs,
    sampleRate,
    channelCount,
    fftSize: songAnalysisFftSize,
    hopSize,
    analysisRateHz: songAnalysisRateHz,
    bucketCount: songAnalysisBucketCount,
    windowFunction: "hann",
    normalization: {
      volumePeak,
      lowPeak,
      midPeak,
      highPeak,
    },
    frames,
  }
}

export function getFrameAtTime(
  analysis: SongAnalysis,
  timeMs: number,
): SongAnalysisFrame | null {
  const frames = analysis.frames

  if (frames.length === 0) {
    return null
  }

  const clampedTime = clamp(timeMs, 0, analysis.durationMs)
  let low = 0
  let high = frames.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const frame = frames[mid]

    if (!frame) {
      break
    }

    if (frame.timeMs === clampedTime) {
      return frame
    }

    if (frame.timeMs < clampedTime) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const previous = frames[Math.max(0, high)]
  const next = frames[Math.min(frames.length - 1, low)]

  if (!previous) {
    return next ?? null
  }

  if (!next) {
    return previous
  }

  return clampedTime - previous.timeMs <= next.timeMs - clampedTime
    ? previous
    : next
}

export function getFramesInWindow(
  analysis: SongAnalysis,
  startMs: number,
  endMs: number,
) {
  const start = Math.min(startMs, endMs)
  const end = Math.max(startMs, endMs)

  return analysis.frames.filter(
    (frame) => frame.timeMs >= start && frame.timeMs <= end,
  )
}

export function getPeakAhead(
  analysis: SongAnalysis,
  timeMs: number,
  lookaheadMs: number,
  band: SongPeakBand,
) {
  return getFramesInWindow(analysis, timeMs, timeMs + Math.max(0, lookaheadMs))
    .reduce(
      (peak, frame) =>
        frame[band] > peak.value
          ? { timeMs: frame.timeMs, value: frame[band], frame }
          : peak,
      { timeMs, value: 0, frame: null as SongAnalysisFrame | null },
    )
}

export function getAverageSpectrumAhead(
  analysis: SongAnalysis,
  timeMs: number,
  lookaheadMs: number,
) {
  const frames = getFramesInWindow(
    analysis,
    timeMs,
    timeMs + Math.max(0, lookaheadMs),
  )
  const totals = Array.from({ length: analysis.bucketCount }, () => 0)

  if (frames.length === 0) {
    return totals
  }

  frames.forEach((frame) => {
    frame.controlSpectrum.forEach((value, index) => {
      totals[index] = (totals[index] ?? 0) + value
    })
  })

  return totals.map((total) => clamp(total / frames.length, 0, 1))
}
