import assert from "node:assert/strict"
import { test } from "node:test"
import {
  sampleSpectrumRange,
  smoothAudioRouteValue,
  isAboveTriggerLevel,
  transformAudioRouteValue,
  updateAdaptiveTriggerState,
  updateAudioLevelMotionState,
  updateAudioRouteSignalState,
} from "./audioRoutingLogic.ts"

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `Expected ${actual} to be close to ${expected}`,
  )
}

test("samples a percentage range from a normalized spectrum", () => {
  assert.equal(sampleSpectrumRange([0, 0.5, 1, 0.5], 25, 75), 0.75)
})

test("transforms audio route values with gain threshold and invert", () => {
  const baseRoute = { gain: 2, threshold: 0.4, invert: false }

  assert.equal(transformAudioRouteValue(0.1, baseRoute), 0)
  assert.equal(transformAudioRouteValue(0.3, baseRoute), 0.6)
  assert.equal(
    transformAudioRouteValue(0.3, { ...baseRoute, invert: true }),
    0.4,
  )
})

test("smooths route values", () => {
  assert.equal(smoothAudioRouteValue(0, 1, 0.75), 0.25)
})

test("checks upward trigger thresholds", () => {
  assert.equal(isAboveTriggerLevel(0.5, 0.4), true)
  assert.equal(isAboveTriggerLevel(0.4, 0.4), true)
  assert.equal(isAboveTriggerLevel(0.2, 0.4), false)
  assert.equal(isAboveTriggerLevel(0.5, 1.2), false)
})

test("adapts trigger level from recent local floor and ceiling", () => {
  const options = { sensitivity: 0.5, adaptSpeed: 0.5, minRange: 0.1 }
  let state = updateAdaptiveTriggerState(null, 0.2, options)

  assertClose(state.floor, 0.2)
  assertClose(state.ceiling, 0.2)
  assertClose(state.triggerLevel, 0.25)

  state = updateAdaptiveTriggerState(state, 0.8, options)

  assertClose(state.floor, 0.26)
  assertClose(state.ceiling, 0.5)
  assertClose(state.triggerLevel, 0.38)

  state = updateAdaptiveTriggerState(state, 0.1, options)

  assertClose(state.floor, 0.18)
  assertClose(state.ceiling, 0.46)
  assertClose(state.triggerLevel, 0.32)
})

test("tracks level motion rise and fall from changing averages", () => {
  const options = {
    fastSpeed: 0.6,
    slowSpeed: 0.12,
    floorRiseSpeed: 0.04,
    peakFallSpeed: 0.04,
    minRange: 0.08,
    rateScale: 4,
  }
  let state = updateAudioLevelMotionState(null, 0.1, 0, options)

  assert.equal(state.level, 0.1)
  assert.equal(state.riseAmount, 0)
  assert.equal(state.fallAmount, 0)

  state = updateAudioLevelMotionState(state, 0.45, 16, options)

  assert.ok(state.riseRate > 0)
  assert.ok(state.riseAmount > 0)
  assert.equal(state.fallRate, 0)
  assert.equal(state.fallAmount, 0)

  const risingLevel = state.fastLevel

  state = updateAudioLevelMotionState(state, 0.42, 32, options)

  assert.ok(state.normalizedLevel > 0)
  assert.ok(state.fastLevel > state.slowLevel)

  state = updateAudioLevelMotionState(state, 0.08, 48, options)

  assert.ok(state.fastLevel < risingLevel)
  assert.ok(state.fallRate > 0)
  assert.ok(state.fallAmount > 0)
  assert.equal(state.riseRate, 0)
})

test("updates route signals with manual trigger crossing and cooldown", () => {
  const settings = {
    sampleStartPercent: 0,
    sampleEndPercent: 20,
    triggerMode: "manual",
    triggerLevel: 0.4,
    adaptiveSensitivity: 0.6,
    adaptiveSpeed: 0.08,
    gain: 1,
    cooldownMs: 100,
    circleColor: "#00d1ff",
    circleGrowOnRise: false,
    circleFadeOnFall: false,
    circleShrinkOnFall: false,
    circleLevelControlsSize: false,
  }
  let result = updateAudioRouteSignalState({
    previousState: null,
    sampleValue: 0.2,
    settings,
    timestamp: 0,
  })

  assert.equal(result.triggered, false)

  result = updateAudioRouteSignalState({
    previousState: result.follower,
    sampleValue: 0.6,
    settings,
    timestamp: 120,
  })

  assert.equal(result.triggered, true)
  assert.ok(result.riseRate > 0)

  result = updateAudioRouteSignalState({
    previousState: result.follower,
    sampleValue: 0.65,
    settings,
    timestamp: 150,
  })

  assert.equal(result.triggered, false)

  result = updateAudioRouteSignalState({
    previousState: result.follower,
    sampleValue: 0.1,
    settings,
    timestamp: 220,
  })

  assert.equal(result.triggered, false)
  assert.ok(result.fallRate > 0)
})

test("updates route signals with adaptive trigger state", () => {
  const settings = {
    sampleStartPercent: 0,
    sampleEndPercent: 20,
    triggerMode: "adaptive",
    triggerLevel: 0.4,
    adaptiveSensitivity: 0.5,
    adaptiveSpeed: 0.5,
    gain: 1,
    cooldownMs: 100,
    circleColor: "#00d1ff",
    circleGrowOnRise: false,
    circleFadeOnFall: false,
    circleShrinkOnFall: false,
    circleLevelControlsSize: false,
  }
  let result = updateAudioRouteSignalState({
    previousState: null,
    sampleValue: 0.2,
    settings,
    timestamp: 0,
  })

  assert.ok(result.triggerLevel > 0.2)

  result = updateAudioRouteSignalState({
    previousState: result.follower,
    sampleValue: 0.8,
    settings,
    timestamp: 120,
  })

  assert.ok(result.triggerLevel > 0.2)
  assert.equal(result.triggered, true)
})
