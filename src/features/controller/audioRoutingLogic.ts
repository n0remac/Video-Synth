import type { AudioRoute } from "./audioRoutingTypes"

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
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

export function isInTriggerRange(value: number, min: number, max: number) {
  const triggerMin = clamp(Math.min(min, max), 0, 1)
  const triggerMax = clamp(Math.max(min, max), 0, 1)

  return value >= triggerMin && value <= triggerMax
}
