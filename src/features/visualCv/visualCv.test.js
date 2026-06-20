import assert from "node:assert/strict"
import { test } from "node:test"
import {
  estimateVisualCvSyncSinePeriod,
  createRoutedAudioRouteSignal,
  getVisualCvSyncSineAnchorPhase,
  getVisualCvModulationValue,
  isVisualCvTriggerActive,
  selectVisualCvInput,
  updateVisualCvEnvelope,
  updateVisualCvSmooth,
  updateVisualCvSyncSine,
} from "./visualCvLogic.ts"

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `Expected ${actual} to be close to ${expected}`,
  )
}

function createFrame(patch = {}) {
  return {
    timestamp: 0,
    level: 0.25,
    riseAmount: 0.45,
    fallAmount: 0.2,
    riseRate: 0.4,
    fallRate: 0.1,
    ...patch,
  }
}

test("selects input values from the selected route motion frame", () => {
  const frame = createFrame()

  assert.equal(selectVisualCvInput(frame, "level"), 0.25)
  assert.equal(selectVisualCvInput(frame, "rise"), 0.45)
  assert.equal(selectVisualCvInput(frame, "fall"), 0.2)
  assert.equal(selectVisualCvInput(frame, "motion"), 0.45)
})

test("clamps selected input values", () => {
  const frame = createFrame({
    level: 1.4,
    riseAmount: -0.2,
    fallAmount: 1.2,
  })

  assert.equal(selectVisualCvInput(frame, "level"), 1)
  assert.equal(selectVisualCvInput(frame, "rise"), 0)
  assert.equal(selectVisualCvInput(frame, "fall"), 1)
  assert.equal(selectVisualCvInput(frame, "motion"), 1)
})

test("smooth output rises and falls with configured slew times", () => {
  const config = {
    input: "level",
    riseMs: 100,
    fallMs: 200,
  }
  let result = updateVisualCvSmooth({
    config,
    frame: createFrame({ timestamp: 0, level: 0 }),
    state: null,
  })

  result = updateVisualCvSmooth({
    config,
    frame: createFrame({ timestamp: 50, level: 1 }),
    state: result.state,
  })

  assertClose(result.raw, 1)
  assertClose(result.output, 0.5)

  result = updateVisualCvSmooth({
    config,
    frame: createFrame({ timestamp: 100, level: 1 }),
    state: result.state,
  })

  assertClose(result.output, 1)

  result = updateVisualCvSmooth({
    config,
    frame: createFrame({ timestamp: 150, level: 0 }),
    state: result.state,
  })

  assertClose(result.output, 0.75)
})

test("envelope triggers when rise crosses the threshold", () => {
  const config = {
    threshold: 0.5,
    attackMs: 100,
    decayMs: 200,
    cooldownMs: 0,
  }
  let result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.2 }),
    state: null,
  })

  assert.equal(result.output, 0)
  assert.equal(result.state.phase, "idle")

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 20, riseAmount: 0.6 }),
    state: result.state,
  })

  assert.equal(result.state.phase, "attack")
  assert.equal(result.output, 0)
})

test("envelope advances through attack and decay", () => {
  const config = {
    threshold: 0.5,
    attackMs: 100,
    decayMs: 200,
    cooldownMs: 0,
  }
  let result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: null,
  })

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 50, riseAmount: 0.7 }),
    state: result.state,
  })

  assertClose(result.output, 0.5)
  assert.equal(result.state.phase, "attack")

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 100, riseAmount: 0.7 }),
    state: result.state,
  })

  assertClose(result.output, 1)
  assert.equal(result.state.phase, "decay")

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 200, riseAmount: 0.2 }),
    state: result.state,
  })

  assertClose(result.output, 0.5)
  assert.equal(result.state.phase, "decay")

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 300, riseAmount: 0.2 }),
    state: result.state,
  })

  assertClose(result.output, 0)
  assert.equal(result.state.phase, "idle")
})

test("envelope respects cooldown before retriggering", () => {
  const config = {
    threshold: 0.5,
    attackMs: 0,
    decayMs: 10,
    cooldownMs: 100,
  }
  let result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: null,
  })

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 20, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 40, riseAmount: 0.7 }),
    state: result.state,
  })

  assert.equal(result.state.phase, "idle")
  assert.equal(result.output, 0)

  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 120, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvEnvelope({
    config,
    frame: createFrame({ timestamp: 140, riseAmount: 0.7 }),
    state: result.state,
  })

  assert.equal(result.state.phase, "decay")
  assert.equal(result.output, 1)
})

test("sync sine detects spikes with threshold and hysteresis", () => {
  const config = {
    input: "motion",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 0,
    lengthMultiple: 1,
    phaseMode: "peakOnSpike",
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 1,
  }
  let result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6, fallAmount: 0 }),
    state: null,
  })

  assert.equal(result.triggered, true)
  assert.equal(result.state.armed, false)

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 100, riseAmount: 0.7, fallAmount: 0 }),
    state: result.state,
  })

  assert.equal(result.triggered, false)
  assert.equal(result.state.armed, false)

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 200, riseAmount: 0.39, fallAmount: 0 }),
    state: result.state,
  })

  assert.equal(result.triggered, false)
  assert.equal(result.state.armed, true)

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 500, riseAmount: 0.6, fallAmount: 0 }),
    state: result.state,
  })

  assert.equal(result.triggered, true)
})

test("sync sine respects cooldown before retriggering", () => {
  const config = {
    input: "rise",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 400,
    lengthMultiple: 1,
    phaseMode: "peakOnSpike",
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 1,
  }
  let result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: null,
  })

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 100, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 250, riseAmount: 0.7 }),
    state: result.state,
  })

  assert.equal(result.triggered, false)

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 500, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 520, riseAmount: 0.7 }),
    state: result.state,
  })

  assert.equal(result.triggered, true)
})

test("sync sine estimates the median period from recent spike intervals", () => {
  assert.equal(estimateVisualCvSyncSinePeriod([0]), null)
  assert.equal(
    estimateVisualCvSyncSinePeriod([0, 500, 1000, 2400, 2900]),
    500,
  )
})

test("sync sine outputs midpoint before it has two spikes", () => {
  const config = {
    input: "rise",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 0,
    lengthMultiple: 1,
    phaseMode: "peakOnSpike",
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 1,
  }
  const result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: null,
  })

  assert.equal(result.triggered, true)
  assert.equal(result.cycleMs, null)
  assert.equal(result.output, 0.5)
})

test("sync sine applies length multiple to the estimated cycle length", () => {
  const config = {
    input: "rise",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 0,
    lengthMultiple: 4,
    phaseMode: "peakOnSpike",
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 1,
  }
  let result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: null,
  })

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 100, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 500, riseAmount: 0.6 }),
    state: result.state,
  })

  assert.equal(result.state.estimatedBasePeriodMs, 500)
  assert.equal(result.cycleMs, 2000)
})

test("sync sine hard sync aligns output to the selected phase mode", () => {
  const baseConfig = {
    input: "rise",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 0,
    lengthMultiple: 1,
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 1,
  }

  for (const [phaseMode, expectedOutput] of [
    ["peakOnSpike", 1],
    ["zeroRisingOnSpike", 0.5],
    ["troughOnSpike", 0],
    ["zeroFallingOnSpike", 0.5],
  ]) {
    const config = {
      ...baseConfig,
      phaseMode,
    }
    let result = updateVisualCvSyncSine({
      config,
      frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
      state: null,
    })

    result = updateVisualCvSyncSine({
      config,
      frame: createFrame({ timestamp: 100, riseAmount: 0.2 }),
      state: result.state,
    })
    result = updateVisualCvSyncSine({
      config,
      frame: createFrame({ timestamp: 500, riseAmount: 0.6 }),
      state: result.state,
    })

    assert.equal(result.triggered, true)
    assertClose(result.output, expectedOutput)
    assertClose(result.state.phaseRadians, getVisualCvSyncSineAnchorPhase(phaseMode))
  }
})

test("sync sine soft sync nudges phase instead of snapping", () => {
  const config = {
    input: "rise",
    threshold: 0.5,
    hysteresis: 0.1,
    cooldownMs: 0,
    lengthMultiple: 1,
    phaseMode: "peakOnSpike",
    syncMode: "soft",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 0.5,
  }
  let result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 0, riseAmount: 0.6 }),
    state: {
      phaseRadians: 0,
      timestamp: 0,
      armed: true,
      lastTriggeredAt: null,
      spikeTimes: [0],
      estimatedBasePeriodMs: null,
      smoothedBasePeriodMs: null,
      output: 0.5,
    },
  })

  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 100, riseAmount: 0.2 }),
    state: result.state,
  })
  result = updateVisualCvSyncSine({
    config,
    frame: createFrame({ timestamp: 500, riseAmount: 0.6 }),
    state: result.state,
  })

  assert.equal(result.triggered, true)
  assert.notEqual(result.state.phaseRadians, getVisualCvSyncSineAnchorPhase("peakOnSpike"))
  assert.ok(result.output > 0.5)
  assert.ok(result.output < 1)
})

test("sync sine output remains normalized", () => {
  const config = {
    input: "level",
    threshold: 0,
    hysteresis: 0,
    cooldownMs: 0,
    lengthMultiple: 0,
    phaseMode: "peakOnSpike",
    syncMode: "hard",
    historyMs: 2000,
    periodSmoothMs: 0,
    phaseCorrectionAmount: 10,
  }
  let result = null

  for (let index = 0; index < 12; index += 1) {
    result = updateVisualCvSyncSine({
      config,
      frame: createFrame({
        timestamp: index * 100,
        level: index % 2 === 0 ? 1 : 0,
      }),
      state: result?.state ?? null,
    })

    assert.ok(result.output >= 0)
    assert.ok(result.output <= 1)
  }
})

test("routes triggered circle values from selected Visual CV outputs", () => {
  const routeSignal = {
    audioInstanceId: "audio-1",
    sampleStartPercent: 0,
    sampleEndPercent: 20,
    level: 0.2,
    fastLevel: 0.2,
    slowLevel: 0.2,
    floor: 0.1,
    peak: 0.8,
    riseAmount: 0.3,
    fallAmount: 0.1,
    riseRate: 0.3,
    fallRate: 0.1,
    triggered: false,
  }
  const visualCvSignal = {
    audioInstanceId: "audio-1",
    timestamp: 1000,
    level: 0.2,
    riseAmount: 0.3,
    fallAmount: 0.1,
    riseRate: 0.3,
    fallRate: 0.1,
    motion: 0.3,
    smooth: 0.44,
    envelope: 0.72,
    syncSine: 0.91,
    rangeTriggered: false,
    envelopeTriggered: true,
    syncSineTriggered: false,
  }
  const routed = createRoutedAudioRouteSignal({
    routeSignal,
    visualCvSignal,
    routing: {
      triggerSource: "envelope",
      sizeSource: "smooth",
      growSource: "envelope",
      releaseSource: "syncSine",
    },
  })

  assert.equal(getVisualCvModulationValue(visualCvSignal, "smooth"), 0.44)
  assert.equal(isVisualCvTriggerActive(visualCvSignal, "envelope"), true)
  assert.equal(routed.triggered, true)
  assert.equal(routed.level, 0.44)
  assert.equal(routed.riseAmount, 0.72)
  assert.equal(routed.fallAmount, 0.91)
})
