import type {
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "../../../shapeGenerator/shapeGeneratorTypes"
import type { VisualCvRouteSignal } from "../../../visualCv/visualCvTypes"
import type {
  SpiralMotionSample,
  SpiralMotionState,
  SpiralMotionTransform,
} from "./spiralMotionTypes"

const millisecondsPerSecond = 1000

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1)

  return t * t * (3 - 2 * t)
}

function toRadians(degrees: number) {
  return (degrees / 180) * Math.PI
}

function getDirectionSign(direction: ShapeSpiralMotionSettings["direction"]) {
  return direction === "clockwise" ? -1 : 1
}

function getSpiralCvModulationValue(
  signal: VisualCvRouteSignal,
  source: ShapeSpiralMotionSettings["radiusSource"],
) {
  if (source === "smooth") {
    return signal.smooth
  }

  if (source === "envelope") {
    return signal.envelope
  }

  if (source === "syncSine") {
    return signal.syncSine
  }

  if (source === "rise") {
    return signal.riseAmount
  }

  if (source === "fall") {
    return signal.fallAmount
  }

  if (source === "motion") {
    return signal.motion
  }

  return signal.level
}

export function createSpiralMotionState(
  settings: ShapeSpiralMotionSettings,
): SpiralMotionState {
  return {
    elapsedMs: 0,
    phaseDegrees: settings.startPhaseDegrees,
    zOffset: 0,
    lastFrequencyHz: 0,
  }
}

export function getSpiralResetMs(settings: ShapeSpiralMotionSettings) {
  return Math.max(settings.resetMs, 250)
}

export function getSpiralProgress(
  state: SpiralMotionState,
  settings: ShapeSpiralMotionSettings,
) {
  return clamp(state.elapsedMs / getSpiralResetMs(settings), 0, 1)
}

export function getSpiralEffectiveRadius(
  settings: ShapeSpiralMotionSettings,
  signal: VisualCvRouteSignal | null,
) {
  const modulation = signal
    ? getSpiralCvModulationValue(signal, settings.radiusSource)
    : 0

  return Math.max(settings.startRadius + modulation * settings.radiusCvAmount, 0)
}

export function getSpiralRadius({
  progress,
  settings,
  signal,
}: {
  progress: number
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
}) {
  return getSpiralEffectiveRadius(settings, signal) * (1 - smoothstep(progress))
}

export function updateSpiralMotionState({
  dt,
  settings,
  signal,
  state,
}: {
  dt: number
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  state: SpiralMotionState
}): SpiralMotionState {
  const frequencyHz = Math.max(signal?.frequencyHz ?? 0, 0)
  const lastFrequencyHz =
    frequencyHz > 0 ? frequencyHz : state.lastFrequencyHz

  if (frequencyHz <= 0 || dt <= 0) {
    return {
      ...state,
      lastFrequencyHz,
    }
  }

  const elapsedMs = state.elapsedMs + dt * millisecondsPerSecond
  const resetMs = getSpiralResetMs(settings)

  if (elapsedMs >= resetMs) {
    return {
      elapsedMs: 0,
      phaseDegrees: settings.startPhaseDegrees,
      zOffset: 0,
      lastFrequencyHz,
    }
  }

  return {
    elapsedMs,
    phaseDegrees:
      state.phaseDegrees +
      getDirectionSign(settings.direction) *
        settings.degreesPerPulse *
        frequencyHz *
        dt,
    zOffset: state.zOffset - settings.depthPerPulse * frequencyHz * dt,
    lastFrequencyHz,
  }
}

export function getSpiralTransform({
  origin,
  settings,
  signal,
  state,
}: {
  origin: ShapeVector3
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  state: SpiralMotionState
}): SpiralMotionTransform {
  const progress = getSpiralProgress(state, settings)
  const radius = getSpiralRadius({ progress, settings, signal })
  const phaseRadians = toRadians(state.phaseDegrees)
  const xOffset = Math.cos(phaseRadians) * radius
  const yOffset = Math.sin(phaseRadians) * radius

  return {
    position: {
      x: origin.x + xOffset,
      y: origin.y + yOffset,
      z: origin.z + state.zOffset,
    },
    phaseDegrees: state.phaseDegrees,
    progress,
    radius,
    zOffset: state.zOffset,
    frequencyHz: Math.max(signal?.frequencyHz ?? 0, 0),
  }
}

export function sampleSpiralPath({
  frequencyHz,
  origin,
  sampleCount = 96,
  settings,
  signal,
}: {
  frequencyHz: number
  origin: ShapeVector3
  sampleCount?: number
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
}): SpiralMotionSample[] {
  const count = Math.max(Math.floor(sampleCount), 2)
  const resetSeconds = getSpiralResetMs(settings) / millisecondsPerSecond
  const effectiveFrequencyHz = Math.max(frequencyHz, 0)
  const direction = getDirectionSign(settings.direction)

  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1)
    const elapsedSeconds = progress * resetSeconds
    const phaseDegrees =
      settings.startPhaseDegrees +
      direction * settings.degreesPerPulse * effectiveFrequencyHz * elapsedSeconds
    const phaseRadians = toRadians(phaseDegrees)
    const radius = getSpiralRadius({ progress, settings, signal })
    const zOffset = -settings.depthPerPulse * effectiveFrequencyHz * elapsedSeconds

    return {
      x: origin.x + Math.cos(phaseRadians) * radius,
      y: origin.y + Math.sin(phaseRadians) * radius,
      z: origin.z + zOffset,
      progress,
    }
  })
}
