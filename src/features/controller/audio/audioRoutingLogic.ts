import type { AudioCircleSettings } from "../../network/protocolTypes"
import type { AudioRoute } from "./audioRoutingTypes"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

export type AdaptiveTriggerState = {
  floor: number
  ceiling: number
  triggerLevel: number
  normalizedSignal: number
}

export type AdaptiveTriggerOptions = {
  sensitivity: number
  adaptSpeed: number
  minRange?: number
}

export type AudioLevelMotionState = {
  level: number
  fastLevel: number
  slowLevel: number
  floor: number
  peak: number
  range: number
  normalizedLevel: number
  delta: number
  riseRate: number
  fallRate: number
  riseAmount: number
  fallAmount: number
  timestamp: number
}

export type AudioLevelMotionOptions = {
  fastSpeed: number
  slowSpeed: number
  floorRiseSpeed: number
  peakFallSpeed: number
  minRange: number
  rateScale: number
}

export type AudioRouteFollowerState = {
  adaptiveTrigger: AdaptiveTriggerState | null
  levelMotion: AudioLevelMotionState | null
  previousInside: boolean
  lastTriggeredAt: number
}

export type AudioRouteSignalState = {
  follower: AudioRouteFollowerState
  level: number
  fastLevel: number
  slowLevel: number
  floor: number
  peak: number
  riseAmount: number
  fallAmount: number
  riseRate: number
  fallRate: number
  triggerLevel: number
  triggered: boolean
}

export const defaultLevelMotionOptions: AudioLevelMotionOptions = {
  fastSpeed: 0.48,
  slowSpeed: 0.07,
  floorRiseSpeed: 0.018,
  peakFallSpeed: 0.026,
  minRange: 0.08,
  rateScale: 5,
}

export function createAudioRouteFollowerState(): AudioRouteFollowerState {
  return {
    adaptiveTrigger: null,
    levelMotion: null,
    previousInside: false,
    lastTriggeredAt: 0,
  }
}

export function sampleSpectrumRange(
  spectrum: number[],
  startPercent: number,
  endPercent: number,
) {
  if (spectrum.length === 0) {
    return 0
  }

  const start = clamp(Math.min(startPercent, endPercent), 0, 100) / 100
  const end = clamp(Math.max(startPercent, endPercent), 0, 100) / 100
  const startIndex = Math.floor(start * spectrum.length)
  const endIndex = Math.max(startIndex + 1, Math.ceil(end * spectrum.length))
  let total = 0

  for (let index = startIndex; index < Math.min(endIndex, spectrum.length); index += 1) {
    total += spectrum[index] ?? 0
  }

  return total / Math.max(Math.min(endIndex, spectrum.length) - startIndex, 1)
}

export function transformAudioRouteValue(
  value: number,
  route: Pick<AudioRoute, "gain" | "threshold" | "invert">,
) {
  const gained = clamp(value * route.gain, 0, 1)
  const thresholded = gained < route.threshold ? 0 : gained

  return route.invert ? 1 - thresholded : thresholded
}

export function smoothAudioRouteValue(
  previousValue: number,
  nextValue: number,
  smoothing: number,
) {
  const amount = clamp(smoothing, 0, 0.98)

  return previousValue * amount + nextValue * (1 - amount)
}

export function isAboveTriggerLevel(value: number, triggerLevel: number) {
  const normalizedTriggerLevel = clamp(triggerLevel, 0, 1)

  return value >= normalizedTriggerLevel
}

export function updateAdaptiveTriggerState(
  previousState: AdaptiveTriggerState | null,
  value: number,
  options: AdaptiveTriggerOptions,
): AdaptiveTriggerState {
  const signal = clamp(value, 0, 1)
  const sensitivity = clamp(options.sensitivity, 0, 1)
  const adaptSpeed = clamp(options.adaptSpeed, 0.005, 1)
  const releaseSpeed = adaptSpeed * 0.2
  const minRange = clamp(options.minRange ?? 0.08, 0.01, 1)

  if (!previousState) {
    const triggerLevel = clamp(signal + minRange * sensitivity, 0, 1)

    return {
      floor: signal,
      ceiling: signal,
      triggerLevel,
      normalizedSignal: signal >= triggerLevel ? 1 : 0,
    }
  }

  const previousFloor = clamp(previousState.floor, 0, 1)
  const previousCeiling = clamp(previousState.ceiling, 0, 1)
  const floorSpeed = signal < previousFloor ? adaptSpeed : releaseSpeed
  const ceilingSpeed = signal > previousCeiling ? adaptSpeed : releaseSpeed
  const nextFloor = lerp(previousFloor, signal, floorSpeed)
  const nextCeiling = lerp(previousCeiling, signal, ceilingSpeed)
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

export function updateAudioLevelMotionState(
  previousState: AudioLevelMotionState | null,
  value: number,
  timestamp: number,
  options: AudioLevelMotionOptions,
): AudioLevelMotionState {
  const level = clamp(value, 0, 1)
  const fastSpeed = clamp(options.fastSpeed, 0.001, 1)
  const slowSpeed = clamp(options.slowSpeed, 0.001, 1)
  const floorRiseSpeed = clamp(options.floorRiseSpeed, 0.001, 1)
  const peakFallSpeed = clamp(options.peakFallSpeed, 0.001, 1)
  const minRange = clamp(options.minRange, 0.001, 1)
  const rateScale = Math.max(options.rateScale, 0.001)

  if (!previousState) {
    return {
      level,
      fastLevel: level,
      slowLevel: level,
      floor: level,
      peak: level,
      range: minRange,
      normalizedLevel: 0,
      delta: 0,
      riseRate: 0,
      fallRate: 0,
      riseAmount: 0,
      fallAmount: 0,
      timestamp,
    }
  }

  const fastLevel = lerp(previousState.fastLevel, level, fastSpeed)
  const slowLevel = lerp(previousState.slowLevel, level, slowSpeed)
  const floor =
    fastLevel < previousState.floor
      ? fastLevel
      : lerp(previousState.floor, fastLevel, floorRiseSpeed)
  const peak =
    fastLevel > previousState.peak
      ? fastLevel
      : lerp(previousState.peak, fastLevel, peakFallSpeed)
  const observedRange = Math.max(peak - floor, 0)
  const range = Math.max(observedRange, minRange)
  const normalizedLevel = clamp((fastLevel - floor) / range, 0, 1)
  const delta = fastLevel - previousState.fastLevel
  const riseRate = clamp((Math.max(delta, 0) / range) * rateScale, 0, 1)
  const fallRate = clamp((Math.max(-delta, 0) / range) * rateScale, 0, 1)
  const riseShape = clamp((fastLevel - slowLevel) / range, 0, 1)
  const fallShape = clamp((slowLevel - fastLevel) / range, 0, 1)
  const riseAmount = clamp(riseShape * 0.62 + riseRate * 0.38, 0, 1)
  const fallAmount = clamp(fallShape * 0.62 + fallRate * 0.38, 0, 1)

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
    riseAmount,
    fallAmount,
    timestamp,
  }
}

export function updateAudioRouteSignalState({
  previousState,
  sampleValue,
  settings,
  timestamp,
  levelMotionOptions = defaultLevelMotionOptions,
}: {
  previousState: AudioRouteFollowerState | null
  sampleValue: number
  settings: AudioCircleSettings
  timestamp: number
  levelMotionOptions?: AudioLevelMotionOptions
}): AudioRouteSignalState {
  const follower = previousState ?? createAudioRouteFollowerState()
  const level = clamp(sampleValue * settings.gain, 0, 1)
  const levelMotion = updateAudioLevelMotionState(
    follower.levelMotion,
    level,
    timestamp,
    levelMotionOptions,
  )
  let adaptiveTrigger = follower.adaptiveTrigger
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

  const inside = isAboveTriggerLevel(level, triggerLevel)
  const triggered =
    inside &&
    !follower.previousInside &&
    timestamp - follower.lastTriggeredAt >= settings.cooldownMs

  return {
    follower: {
      adaptiveTrigger,
      levelMotion,
      previousInside: inside,
      lastTriggeredAt: triggered ? timestamp : follower.lastTriggeredAt,
    },
    level,
    fastLevel: levelMotion.fastLevel,
    slowLevel: levelMotion.slowLevel,
    floor: levelMotion.floor,
    peak: levelMotion.peak,
    riseAmount: levelMotion.riseAmount,
    fallAmount: levelMotion.fallAmount,
    riseRate: levelMotion.riseRate,
    fallRate: levelMotion.fallRate,
    triggerLevel,
    triggered,
  }
}
