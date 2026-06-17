import assert from "node:assert/strict"
import { test } from "node:test"
import {
  selectVisualCvInput,
  updateVisualCvEnvelope,
  updateVisualCvSmooth,
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
