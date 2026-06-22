import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createSpiralMotionState,
  getSpiralEffectiveRadius,
  getSpiralTransform,
  updateSpiralMotionState,
} from "./spiralMotionLogic.ts"

const baseSettings = {
  enabled: true,
  visualize: true,
  startRadius: 1,
  radiusSource: "level",
  radiusCvAmount: 0,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  resetMs: 4000,
  direction: "counterclockwise",
  startPhaseDegrees: 0,
}

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `Expected ${actual} to be close to ${expected}`,
  )
}

function createSignal(patch = {}) {
  return {
    audioInstanceId: "audio-1",
    timestamp: 0,
    level: 0,
    riseAmount: 0,
    fallAmount: 0,
    riseRate: 0,
    fallRate: 0,
    motion: 0,
    smooth: 0,
    envelope: 0,
    syncSine: 0,
    frequencyHz: 2,
    rangeTriggered: false,
    envelopeTriggered: false,
    syncSineTriggered: false,
    ...patch,
  }
}

test("spiral phase advances by degrees per pulse after one pulse worth of time", () => {
  const nextState = updateSpiralMotionState({
    dt: 0.5,
    settings: baseSettings,
    signal: createSignal({ frequencyHz: 2 }),
    state: createSpiralMotionState(baseSettings),
  })

  assertClose(nextState.phaseDegrees, 180)
})

test("spiral radius moves inward over reset progress", () => {
  const transform = getSpiralTransform({
    origin: { x: 0, y: 0, z: 0 },
    settings: baseSettings,
    signal: createSignal(),
    state: {
      elapsedMs: 2000,
      phaseDegrees: 0,
      zOffset: 0,
      lastFrequencyHz: 2,
    },
  })

  assert.ok(transform.radius < baseSettings.startRadius)
  assert.ok(transform.radius > 0)
})

test("spiral z offset moves away from the camera with depth per pulse", () => {
  const nextState = updateSpiralMotionState({
    dt: 1,
    settings: baseSettings,
    signal: createSignal({ frequencyHz: 2 }),
    state: createSpiralMotionState(baseSettings),
  })

  assertClose(nextState.zOffset, -1)
})

test("spiral reset restores phase progress and z offset", () => {
  const settings = {
    ...baseSettings,
    startPhaseDegrees: 45,
  }
  const nextState = updateSpiralMotionState({
    dt: 0.02,
    settings,
    signal: createSignal({ frequencyHz: 2 }),
    state: {
      elapsedMs: 3990,
      phaseDegrees: 123,
      zOffset: -4,
      lastFrequencyHz: 2,
    },
  })

  assertClose(nextState.elapsedMs, 0)
  assertClose(nextState.phaseDegrees, 45)
  assertClose(nextState.zOffset, 0)
})

test("spiral radius cv modulation affects spiral size", () => {
  const radius = getSpiralEffectiveRadius(
    {
      ...baseSettings,
      radiusCvAmount: 0.4,
    },
    createSignal({ level: 0.5 }),
  )

  assertClose(radius, 1.2)
})
