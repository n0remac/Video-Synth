import assert from "node:assert/strict"
import { test } from "node:test"
import {
  addRipple,
  updateRipplePaintState,
  updateRipplePaintStateFromAudioRoute,
} from "./ripplePaintLogic.ts"

function createRouteSignal(patch = {}) {
  return {
    audioInstanceId: "audio-1",
    sampleStartPercent: 0,
    sampleEndPercent: 20,
    level: 0.6,
    fastLevel: 0.6,
    slowLevel: 0.4,
    floor: 0.1,
    peak: 0.8,
    riseAmount: 0.7,
    fallAmount: 0,
    riseRate: 0.7,
    fallRate: 0,
    triggered: false,
    ...patch,
  }
}

test("audio ripple grows on rise and releases on the next fall", () => {
  let state = addRipple(
    { ripples: [] },
    {
      id: "ripple-1",
      userId: "audio-1",
      x: 0,
      y: 0,
      speed: 2,
      color: "#00d1ff",
      audioMotion: {
        audioInstanceId: "audio-1",
        growOnRise: true,
        fadeOnFall: true,
        shrinkOnFall: true,
        levelControlsSize: true,
        level: 0.6,
        riseAmount: 0.7,
        fallAmount: 0,
      },
    },
    8,
  )

  state = updateRipplePaintState(state, 0.2)
  const grownRadius = state.ripples[0].radius

  assert.ok(grownRadius > 0.001)
  assert.equal(state.ripples[0].audioMotion?.phase, "rising")

  state = updateRipplePaintStateFromAudioRoute(
    state,
    createRouteSignal({ riseAmount: 0, fallAmount: 0.8 }),
  )
  state = updateRipplePaintState(state, 0.05)

  assert.equal(state.ripples[0].audioMotion?.phase, "falling")
  assert.ok(state.ripples[0].radius < grownRadius)
  assert.ok(state.ripples[0].opacity < 1)
})
