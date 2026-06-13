import assert from "node:assert/strict"
import { test } from "node:test"
import {
  sampleSpectrumRange,
  smoothAudioRouteValue,
  isAboveTriggerLevel,
  transformAudioRouteValue,
  updateAdaptiveTriggerState,
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
