import type { AudioRouteSignal } from "@/features/network/protocolTypes"
import type {
  TriggeredCircleVisualCvRouting,
  VisualCvEnvelopeConfig,
  VisualCvEnvelopeState,
  VisualCvEnvelopeUpdateResult,
  VisualCvInputFrame,
  VisualCvInputSignal,
  VisualCvModulationSource,
  VisualCvRouteSignal,
  VisualCvSmoothConfig,
  VisualCvSmoothState,
  VisualCvSyncSineConfig,
  VisualCvSyncSinePhaseMode,
  VisualCvSyncSineState,
  VisualCvSyncSineUpdateResult,
  VisualCvSettings,
  VisualCvTriggerSource,
  VisualCvUpdateResult,
} from "./visualCvTypes"

const twoPi = Math.PI * 2
const minSpikeIntervalMs = 80
const maxSpikeIntervalMs = 4000

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function moveToward(current: number, target: number, maxStep: number) {
  if (current < target) {
    return Math.min(current + maxStep, target)
  }

  return Math.max(current - maxStep, target)
}

function getElapsedMs(timestamp: number, previousTimestamp: number) {
  return Math.max(0, timestamp - previousTimestamp)
}

function normalizePhase(phaseRadians: number) {
  const normalized = phaseRadians % twoPi

  return normalized < 0 ? normalized + twoPi : normalized
}

function getShortestPhaseDelta(fromRadians: number, toRadians: number) {
  return Math.atan2(
    Math.sin(toRadians - fromRadians),
    Math.cos(toRadians - fromRadians),
  )
}

export function getVisualCvSyncSineAnchorPhase(
  phaseMode: VisualCvSyncSinePhaseMode,
) {
  if (phaseMode === "zeroRisingOnSpike") {
    return 0
  }

  if (phaseMode === "troughOnSpike") {
    return Math.PI * 1.5
  }

  if (phaseMode === "zeroFallingOnSpike") {
    return Math.PI
  }

  return Math.PI / 2
}

export function selectVisualCvInput(
  frame: VisualCvInputFrame,
  signal: VisualCvInputSignal,
) {
  if (signal === "rise") {
    return clamp(frame.riseAmount, 0, 1)
  }

  if (signal === "fall") {
    return clamp(frame.fallAmount, 0, 1)
  }

  if (signal === "motion") {
    return clamp(Math.max(frame.riseAmount, frame.fallAmount), 0, 1)
  }

  return clamp(frame.level, 0, 1)
}

export function updateVisualCvSmooth({
  config,
  frame,
  state,
}: {
  config: VisualCvSmoothConfig
  frame: VisualCvInputFrame
  state: VisualCvSmoothState | null
}): VisualCvUpdateResult<VisualCvSmoothState> {
  const raw = selectVisualCvInput(frame, config.input)

  if (!state) {
    return {
      raw,
      output: raw,
      state: {
        value: raw,
        timestamp: frame.timestamp,
      },
    }
  }

  const elapsedMs = getElapsedMs(frame.timestamp, state.timestamp)
  const timeMs = raw >= state.value ? config.riseMs : config.fallMs
  const output =
    timeMs <= 0
      ? raw
      : moveToward(state.value, raw, elapsedMs / Math.max(timeMs, 1))
  const clampedOutput = clamp(output, 0, 1)

  return {
    raw,
    output: clampedOutput,
    state: {
      value: clampedOutput,
      timestamp: frame.timestamp,
    },
  }
}

export function updateVisualCvEnvelope({
  config,
  frame,
  state,
}: {
  config: VisualCvEnvelopeConfig
  frame: VisualCvInputFrame
  state: VisualCvEnvelopeState | null
}): VisualCvEnvelopeUpdateResult {
  const raw = clamp(frame.riseAmount, 0, 1)
  const threshold = clamp(config.threshold, 0, 1)
  const previousState =
    state ??
    ({
      phase: "idle",
      phaseStartedAt: frame.timestamp,
      previousTriggerValue: 0,
      lastTriggeredAt: null,
      value: 0,
    } satisfies VisualCvEnvelopeState)
  const cooldownReady =
    previousState.lastTriggeredAt === null ||
    frame.timestamp - previousState.lastTriggeredAt >= Math.max(config.cooldownMs, 0)
  const triggered =
    previousState.previousTriggerValue < threshold &&
    raw >= threshold &&
    cooldownReady
  let phase = triggered ? "attack" : previousState.phase
  let phaseStartedAt = triggered
    ? frame.timestamp
    : previousState.phaseStartedAt
  let value = triggered ? 0 : previousState.value
  const lastTriggeredAt = triggered
    ? frame.timestamp
    : previousState.lastTriggeredAt

  if (phase === "attack") {
    const attackMs = Math.max(config.attackMs, 0)
    const elapsedMs = Math.max(frame.timestamp - phaseStartedAt, 0)

    if (attackMs <= 0 || elapsedMs >= attackMs) {
      phase = "decay"
      phaseStartedAt += attackMs
    } else {
      value = clamp(elapsedMs / attackMs, 0, 1)
    }
  }

  if (phase === "decay") {
    const decayMs = Math.max(config.decayMs, 0)
    const elapsedMs = Math.max(frame.timestamp - phaseStartedAt, 0)

    if (decayMs <= 0 || elapsedMs >= decayMs) {
      phase = "idle"
      phaseStartedAt = frame.timestamp
      value = 0
    } else {
      value = clamp(1 - elapsedMs / decayMs, 0, 1)
    }
  }

  if (phase === "idle" && !triggered) {
    value = 0
  }

  const output = clamp(value, 0, 1)

  return {
    raw,
    output,
    triggered,
    state: {
      phase,
      phaseStartedAt,
      previousTriggerValue: raw,
      lastTriggeredAt,
      value: output,
    },
  }
}

export function estimateVisualCvSyncSinePeriod(spikeTimes: number[]) {
  if (spikeTimes.length < 2) {
    return null
  }

  const intervals: number[] = []

  for (let index = 1; index < spikeTimes.length; index += 1) {
    const interval = (spikeTimes[index] ?? 0) - (spikeTimes[index - 1] ?? 0)

    if (interval >= minSpikeIntervalMs && interval <= maxSpikeIntervalMs) {
      intervals.push(interval)
    }
  }

  if (intervals.length === 0) {
    return null
  }

  intervals.sort((left, right) => left - right)

  return intervals[Math.floor(intervals.length / 2)] ?? null
}

function smoothPeriod({
  elapsedMs,
  nextPeriodMs,
  previousPeriodMs,
  periodSmoothMs,
}: {
  elapsedMs: number
  nextPeriodMs: number | null
  previousPeriodMs: number | null
  periodSmoothMs: number
}) {
  if (nextPeriodMs === null) {
    return previousPeriodMs
  }

  if (previousPeriodMs === null || periodSmoothMs <= 0) {
    return nextPeriodMs
  }

  const amount = clamp(elapsedMs / Math.max(periodSmoothMs, 1), 0, 1)

  return previousPeriodMs + (nextPeriodMs - previousPeriodMs) * amount
}

export function updateVisualCvSyncSine({
  config,
  frame,
  state,
}: {
  config: VisualCvSyncSineConfig
  frame: VisualCvInputFrame
  state: VisualCvSyncSineState | null
}): VisualCvSyncSineUpdateResult {
  const raw = selectVisualCvInput(frame, config.input)
  const threshold = clamp(config.threshold, 0, 1)
  const hysteresis = clamp(config.hysteresis, 0, 1)
  const historyMs = Math.max(config.historyMs, 0)
  const previousState =
    state ??
    ({
      phaseRadians: getVisualCvSyncSineAnchorPhase(config.phaseMode),
      timestamp: frame.timestamp,
      armed: true,
      lastTriggeredAt: null,
      spikeTimes: [],
      estimatedBasePeriodMs: null,
      smoothedBasePeriodMs: null,
      output: 0.5,
    } satisfies VisualCvSyncSineState)
  const elapsedMs = getElapsedMs(frame.timestamp, previousState.timestamp)
  const cooldownReady =
    previousState.lastTriggeredAt === null ||
    frame.timestamp - previousState.lastTriggeredAt >= Math.max(config.cooldownMs, 0)
  const triggered = previousState.armed && raw >= threshold && cooldownReady
  const earliestSpikeTime = frame.timestamp - historyMs
  const spikeTimes = [
    ...previousState.spikeTimes,
    ...(triggered ? [frame.timestamp] : []),
  ].filter((spikeTime) => spikeTime >= earliestSpikeTime)
  const estimatedBasePeriodMs = estimateVisualCvSyncSinePeriod(spikeTimes)
  const smoothedBasePeriodMs = smoothPeriod({
    elapsedMs,
    nextPeriodMs: estimatedBasePeriodMs,
    previousPeriodMs: previousState.smoothedBasePeriodMs,
    periodSmoothMs: Math.max(config.periodSmoothMs, 0),
  })
  const lengthMultiple = Math.max(config.lengthMultiple, 0.001)
  const cycleMs =
    smoothedBasePeriodMs === null
      ? null
      : Math.max(smoothedBasePeriodMs * lengthMultiple, 1)
  const anchorPhase = getVisualCvSyncSineAnchorPhase(config.phaseMode)
  let phaseRadians = previousState.phaseRadians

  if (cycleMs !== null) {
    phaseRadians = normalizePhase(
      phaseRadians + elapsedMs / cycleMs * twoPi,
    )
  }

  if (triggered) {
    if (config.syncMode === "hard") {
      phaseRadians = anchorPhase
    } else {
      const correctionAmount = clamp(config.phaseCorrectionAmount, 0, 1)
      phaseRadians = normalizePhase(
        phaseRadians +
          getShortestPhaseDelta(phaseRadians, anchorPhase) * correctionAmount,
      )
    }
  }

  const output =
    cycleMs === null ? 0.5 : clamp((Math.sin(phaseRadians) + 1) / 2, 0, 1)
  const armed = triggered
    ? false
    : raw <= Math.max(threshold - hysteresis, 0)
      ? true
      : previousState.armed

  return {
    raw,
    output,
    triggered,
    cycleMs,
    state: {
      phaseRadians: normalizePhase(phaseRadians),
      timestamp: frame.timestamp,
      armed,
      lastTriggeredAt: triggered
        ? frame.timestamp
        : previousState.lastTriggeredAt,
      spikeTimes,
      estimatedBasePeriodMs,
      smoothedBasePeriodMs,
      output,
    },
  }
}

export type VisualCvRouteState = {
  timestamp: number
  smooth: VisualCvSmoothState
  envelope: VisualCvEnvelopeState
  syncSine: VisualCvSyncSineState
}

function getUsablePreviousRouteState(
  state: VisualCvRouteState | null,
  timestamp: number,
) {
  return state && timestamp >= state.timestamp ? state : null
}

export function updateVisualCvRouteSignal({
  routeSignal,
  settings,
  state,
  timestamp,
}: {
  routeSignal: AudioRouteSignal
  settings: VisualCvSettings
  state: VisualCvRouteState | null
  timestamp: number
}): {
  signal: VisualCvRouteSignal
  state: VisualCvRouteState
} {
  const previousState = getUsablePreviousRouteState(state, timestamp)
  const frame = {
    timestamp,
    level: routeSignal.level,
    riseAmount: routeSignal.riseAmount,
    fallAmount: routeSignal.fallAmount,
    riseRate: routeSignal.riseRate,
    fallRate: routeSignal.fallRate,
  }
  const smooth = updateVisualCvSmooth({
    config: settings.smooth,
    frame,
    state: previousState?.smooth ?? null,
  })
  const envelope = updateVisualCvEnvelope({
    config: settings.envelope,
    frame,
    state: previousState?.envelope ?? null,
  })
  const syncSine = updateVisualCvSyncSine({
    config: settings.syncSine,
    frame,
    state: previousState?.syncSine ?? null,
  })

  return {
    signal: {
      audioInstanceId: routeSignal.audioInstanceId,
      timestamp,
      level: clamp(routeSignal.level, 0, 1),
      riseAmount: clamp(routeSignal.riseAmount, 0, 1),
      fallAmount: clamp(routeSignal.fallAmount, 0, 1),
      riseRate: clamp(routeSignal.riseRate, 0, 1),
      fallRate: clamp(routeSignal.fallRate, 0, 1),
      motion: clamp(Math.max(routeSignal.riseAmount, routeSignal.fallAmount), 0, 1),
      smooth: smooth.output,
      envelope: envelope.output,
      syncSine: syncSine.output,
      rangeTriggered: routeSignal.triggered,
      envelopeTriggered: envelope.triggered,
      syncSineTriggered: syncSine.triggered,
    },
    state: {
      timestamp,
      smooth: smooth.state,
      envelope: envelope.state,
      syncSine: syncSine.state,
    },
  }
}

export function getVisualCvModulationValue(
  signal: VisualCvRouteSignal,
  source: VisualCvModulationSource,
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

export function isVisualCvTriggerActive(
  signal: VisualCvRouteSignal,
  source: VisualCvTriggerSource,
) {
  if (source === "envelope") {
    return signal.envelopeTriggered
  }

  if (source === "syncSine") {
    return signal.syncSineTriggered
  }

  return signal.rangeTriggered
}

export function createRoutedAudioRouteSignal({
  routeSignal,
  routing,
  visualCvSignal,
}: {
  routeSignal: AudioRouteSignal
  routing: TriggeredCircleVisualCvRouting
  visualCvSignal: VisualCvRouteSignal
}): AudioRouteSignal {
  const level = getVisualCvModulationValue(visualCvSignal, routing.sizeSource)
  const riseAmount = getVisualCvModulationValue(
    visualCvSignal,
    routing.growSource,
  )
  const fallAmount = getVisualCvModulationValue(
    visualCvSignal,
    routing.releaseSource,
  )

  return {
    ...routeSignal,
    level,
    fastLevel: level,
    slowLevel: level,
    riseAmount,
    fallAmount,
    riseRate: riseAmount,
    fallRate: fallAmount,
    triggered: isVisualCvTriggerActive(visualCvSignal, routing.triggerSource),
  }
}
