import type {
  VisualCvEnvelopeConfig,
  VisualCvEnvelopeState,
  VisualCvInputFrame,
  VisualCvInputSignal,
  VisualCvSmoothConfig,
  VisualCvSmoothState,
  VisualCvUpdateResult,
} from "./visualCvTypes"

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
}): VisualCvUpdateResult<VisualCvEnvelopeState> {
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
    state: {
      phase,
      phaseStartedAt,
      previousTriggerValue: raw,
      lastTriggeredAt,
      value: output,
    },
  }
}
