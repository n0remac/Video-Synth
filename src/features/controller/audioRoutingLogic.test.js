import assert from "node:assert/strict"
import { test } from "node:test"
import {
  sampleSpectrumRange,
  smoothAudioRouteValue,
  isInTriggerRange,
  transformAudioRouteValue,
} from "./audioRoutingLogic.ts"

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

test("checks trigger ranges independent of slider ordering", () => {
  assert.equal(isInTriggerRange(0.5, 0.4, 0.7), true)
  assert.equal(isInTriggerRange(0.5, 0.7, 0.4), true)
  assert.equal(isInTriggerRange(0.2, 0.4, 0.7), false)
})
