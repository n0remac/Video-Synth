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
