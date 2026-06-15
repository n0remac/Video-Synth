const fftSize = 2048
const spectrumBucketCount = 64
const analysisRateHz = 60
const displayMinDb = -90
const displayMaxDb = -25
const spectrumSmoothing = 0.82
const levelMotionOptions = {
  fastSpeed: 0.48,
  slowSpeed: 0.07,
  floorRiseSpeed: 0.018,
  peakFallSpeed: 0.026,
  minRange: 0.08,
  rateScale: 5,
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function lerp(start, end, amount) {
  return start + (end - start) * amount
}

function averageRange(values, startRatio, endRatio) {
  if (values.length === 0) {
    return 0
  }

  const start = Math.floor(values.length * startRatio)
  const end = Math.max(start + 1, Math.floor(values.length * endRatio))
  let total = 0

  for (let index = start; index < Math.min(end, values.length); index += 1) {
    total += values[index] || 0
  }

  return total / Math.max(Math.min(end, values.length) - start, 1)
}

function sampleSpectrumRange(spectrum, startPercent, endPercent) {
  if (spectrum.length === 0) {
    return 0
  }

  const start = clamp(Math.min(startPercent, endPercent), 0, 100) / 100
  const end = clamp(Math.max(startPercent, endPercent), 0, 100) / 100
  const startIndex = Math.floor(start * spectrum.length)
  const endIndex = Math.max(startIndex + 1, Math.ceil(end * spectrum.length))
  let total = 0

  for (let index = startIndex; index < Math.min(endIndex, spectrum.length); index += 1) {
    total += spectrum[index] || 0
  }

  return total / Math.max(Math.min(endIndex, spectrum.length) - startIndex, 1)
}

function getDominantBin(values) {
  let dominantBin = 0
  let dominantValue = -1

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] || 0

    if (value > dominantValue) {
      dominantValue = value
      dominantBin = index
    }
  }

  return dominantBin
}

function createHannWindow(size) {
  const values = new Float32Array(size)

  for (let index = 0; index < size; index += 1) {
    values[index] = 0.5 * (1 - Math.cos((Math.PI * 2 * index) / (size - 1)))
  }

  return values
}

function fft(real, imag) {
  const size = real.length

  for (let index = 1, swapIndex = 0; index < size; index += 1) {
    let bit = size >> 1

    for (; swapIndex & bit; bit >>= 1) {
      swapIndex ^= bit
    }

    swapIndex ^= bit

    if (index < swapIndex) {
      const realValue = real[index]
      const imagValue = imag[index]

      real[index] = real[swapIndex]
      imag[index] = imag[swapIndex]
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
        const oddReal = real[oddIndex] * currentReal - imag[oddIndex] * currentImag
        const oddImag = real[oddIndex] * currentImag + imag[oddIndex] * currentReal

        real[oddIndex] = real[evenIndex] - oddReal
        imag[oddIndex] = imag[evenIndex] - oddImag
        real[evenIndex] += oddReal
        imag[evenIndex] += oddImag

        const nextReal = currentReal * stepReal - currentImag * stepImag
        currentImag = currentReal * stepImag + currentImag * stepReal
        currentReal = nextReal
      }
    }
  }
}

function normalizeSpectrumBins(real, imag, bucketCount, previousSpectrum) {
  const binCount = real.length / 2
  const samplesPerBucket = Math.max(1, Math.floor(binCount / bucketCount))
  const spectrum = []
  const controlSpectrum = []

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * samplesPerBucket
    const end =
      bucketIndex === bucketCount - 1
        ? binCount
        : Math.min(binCount, start + samplesPerBucket)
    let total = 0

    for (let index = start; index < end; index += 1) {
      const magnitude = Math.hypot(real[index] || 0, imag[index] || 0) / (fftSize / 2)
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

    spectrum.push(clamp(smoothedValue, 0, 1))
    controlSpectrum.push(value)
  }

  return { controlSpectrum, spectrum }
}

function updateAdaptiveTriggerState(previousState, value, options) {
  const signal = clamp(value, 0, 1)
  const sensitivity = clamp(options.sensitivity, 0, 1)
  const adaptSpeed = clamp(options.adaptSpeed, 0.005, 1)
  const releaseSpeed = adaptSpeed * 0.2
  const minRange = clamp(options.minRange || 0.08, 0.01, 1)

  if (!previousState) {
    const triggerLevel = clamp(signal + minRange * sensitivity, 0, 1)

    return {
      floor: signal,
      ceiling: signal,
      triggerLevel,
      normalizedSignal: signal >= triggerLevel ? 1 : 0,
    }
  }

  const floorSpeed = signal < previousState.floor ? adaptSpeed : releaseSpeed
  const ceilingSpeed = signal > previousState.ceiling ? adaptSpeed : releaseSpeed
  const nextFloor = lerp(previousState.floor, signal, floorSpeed)
  const nextCeiling = lerp(previousState.ceiling, signal, ceilingSpeed)
  const floor = Math.min(nextFloor, nextCeiling)
  const ceiling = Math.max(nextFloor, nextCeiling)
  const observedRange = ceiling - floor
  const triggerRange = Math.max(observedRange, minRange)
  const triggerLevel = clamp(floor + triggerRange * sensitivity, 0, 1)
  const normalizedSignal =
    observedRange > 0
      ? clamp((signal - floor) / Math.max(observedRange, minRange), 0, 1)
      : signal >= triggerLevel
        ? 1
        : 0

  return {
    floor,
    ceiling,
    triggerLevel,
    normalizedSignal,
  }
}

function updateLevelMotion(previousState, level, timestamp) {
  if (!previousState) {
    return {
      level,
      fastLevel: level,
      slowLevel: level,
      floor: level,
      peak: level,
      range: levelMotionOptions.minRange,
      normalizedLevel: 0,
      delta: 0,
      riseRate: 0,
      fallRate: 0,
      riseAmount: 0,
      fallAmount: 0,
      timestamp,
    }
  }

  const fastLevel = lerp(previousState.fastLevel, level, levelMotionOptions.fastSpeed)
  const slowLevel = lerp(previousState.slowLevel, level, levelMotionOptions.slowSpeed)
  const floor =
    fastLevel < previousState.floor
      ? fastLevel
      : lerp(previousState.floor, fastLevel, levelMotionOptions.floorRiseSpeed)
  const peak =
    fastLevel > previousState.peak
      ? fastLevel
      : lerp(previousState.peak, fastLevel, levelMotionOptions.peakFallSpeed)
  const range = Math.max(peak - floor, levelMotionOptions.minRange)
  const normalizedLevel = clamp((fastLevel - floor) / range, 0, 1)
  const delta = fastLevel - previousState.fastLevel
  const riseRate = clamp((Math.max(delta, 0) / range) * levelMotionOptions.rateScale, 0, 1)
  const fallRate = clamp((Math.max(-delta, 0) / range) * levelMotionOptions.rateScale, 0, 1)
  const riseShape = clamp((fastLevel - slowLevel) / range, 0, 1)
  const fallShape = clamp((slowLevel - fastLevel) / range, 0, 1)

  return {
    level,
    fastLevel,
    slowLevel,
    floor,
    peak,
    range,
    normalizedLevel,
    delta,
    riseRate,
    fallRate,
    riseAmount: clamp(riseShape * 0.62 + riseRate * 0.38, 0, 1),
    fallAmount: clamp(fallShape * 0.62 + fallRate * 0.38, 0, 1),
    timestamp,
  }
}

function createRouteState() {
  return {
    adaptiveTrigger: null,
    levelMotion: null,
    previousInside: false,
    lastTriggeredAt: 0,
  }
}

class SignalPaintAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ringBuffer = new Float32Array(fftSize)
    this.window = createHannWindow(fftSize)
    this.real = new Float32Array(fftSize)
    this.imag = new Float32Array(fftSize)
    this.writeIndex = 0
    this.samplesWritten = 0
    this.samplesSinceAnalysis = 0
    this.sequence = 0
    this.previousSpectrum = null
    this.routes = new Map()
    this.routeStates = new Map()

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "routes") {
        this.updateRoutes(event.data.routes || [])
      }
    }
  }

  updateRoutes(routes) {
    const nextRouteIds = new Set()

    routes.forEach((route) => {
      if (!route || !route.audioInstanceId || !route.settings) {
        return
      }

      nextRouteIds.add(route.audioInstanceId)
      this.routes.set(route.audioInstanceId, route.settings)

      if (!this.routeStates.has(route.audioInstanceId)) {
        this.routeStates.set(route.audioInstanceId, createRouteState())
      }
    })

    Array.from(this.routes.keys()).forEach((routeId) => {
      if (!nextRouteIds.has(routeId)) {
        this.routes.delete(routeId)
        this.routeStates.delete(routeId)
      }
    })
  }

  writeSamples(samples) {
    for (let index = 0; index < samples.length; index += 1) {
      this.ringBuffer[this.writeIndex] = samples[index] || 0
      this.writeIndex = (this.writeIndex + 1) % fftSize
      this.samplesWritten += 1
      this.samplesSinceAnalysis += 1
    }
  }

  copyWindow() {
    for (let index = 0; index < fftSize; index += 1) {
      const sourceIndex = (this.writeIndex + index) % fftSize

      this.real[index] = this.ringBuffer[sourceIndex] * this.window[index]
      this.imag[index] = 0
    }
  }

  analyze() {
    this.copyWindow()
    fft(this.real, this.imag)

    const spectrumResult = normalizeSpectrumBins(
      this.real,
      this.imag,
      spectrumBucketCount,
      this.previousSpectrum,
    )
    const spectrum = spectrumResult.spectrum
    const controlSpectrum = spectrumResult.controlSpectrum

    this.previousSpectrum = spectrum
    const timestamp = currentTime * 1000
    const routes = []
    const triggers = []

    for (const [audioInstanceId, settings] of this.routes) {
      const routeState = this.routeStates.get(audioInstanceId) || createRouteState()
      const rawLevel = sampleSpectrumRange(
        controlSpectrum,
        settings.sampleStartPercent,
        settings.sampleEndPercent,
      )
      const level = clamp(rawLevel * settings.gain, 0, 1)
      const levelMotion = updateLevelMotion(routeState.levelMotion, level, timestamp)
      let adaptiveTrigger = routeState.adaptiveTrigger
      let triggerLevel = settings.triggerLevel

      if (settings.triggerMode === "adaptive") {
        adaptiveTrigger = updateAdaptiveTriggerState(adaptiveTrigger, level, {
          sensitivity: settings.adaptiveSensitivity,
          adaptSpeed: settings.adaptiveSpeed,
        })
        triggerLevel = adaptiveTrigger.triggerLevel
      } else {
        adaptiveTrigger = null
      }

      const inside = level >= clamp(triggerLevel, 0, 1)
      const triggered =
        inside &&
        !routeState.previousInside &&
        timestamp - routeState.lastTriggeredAt >= settings.cooldownMs

      this.routeStates.set(audioInstanceId, {
        adaptiveTrigger,
        levelMotion,
        previousInside: inside,
        lastTriggeredAt: triggered ? timestamp : routeState.lastTriggeredAt,
      })

      routes.push({
        audioInstanceId,
        sampleStartPercent: settings.sampleStartPercent,
        sampleEndPercent: settings.sampleEndPercent,
        level,
        fastLevel: levelMotion.fastLevel,
        slowLevel: levelMotion.slowLevel,
        floor: levelMotion.floor,
        peak: levelMotion.peak,
        riseAmount: levelMotion.riseAmount,
        fallAmount: levelMotion.fallAmount,
        riseRate: levelMotion.riseRate,
        fallRate: levelMotion.fallRate,
        triggered,
      })

      if (triggered) {
        triggers.push({
          audioInstanceId,
          color: settings.circleColor,
          level,
          riseAmount: levelMotion.riseAmount,
          fallAmount: levelMotion.fallAmount,
          timestamp,
        })
      }
    }

    this.port.postMessage({
      type: "analysis",
      frame: {
        volume: averageRange(spectrum, 0, 1),
        low: averageRange(spectrum, 0.02, 0.16),
        mid: averageRange(spectrum, 0.16, 0.48),
        high: averageRange(spectrum, 0.48, 1),
        dominantBin: getDominantBin(spectrum),
        spectrum,
        source: "audio-worklet",
        sequence: this.sequence,
        analysisRateHz,
        routes,
        timestamp,
      },
      triggers,
    })
    this.sequence += 1
  }

  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]

    if (channel) {
      this.writeSamples(channel)
    }

    const analysisIntervalSamples = sampleRate / analysisRateHz

    while (
      this.samplesWritten >= fftSize &&
      this.samplesSinceAnalysis >= analysisIntervalSamples
    ) {
      this.samplesSinceAnalysis -= analysisIntervalSamples
      this.analyze()
    }

    return true
  }
}

registerProcessor("signal-paint-audio-processor", SignalPaintAudioProcessor)
