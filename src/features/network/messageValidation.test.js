import assert from "node:assert/strict"
import { test } from "node:test"
import { parseVisualizerMessage } from "./messageValidation.ts"

const validAudioSettings = {
  sampleStartPercent: 0,
  sampleEndPercent: 20,
  triggerMode: "manual",
  triggerLevel: 0.25,
  adaptiveSensitivity: 0.6,
  adaptiveSpeed: 0.08,
  gain: 1,
  cooldownMs: 250,
  circleColor: "#00d1ff",
  circleGrowOnRise: false,
  circleFadeOnFall: false,
  circleShrinkOnFall: false,
  circleLevelControlsSize: false,
  centerShape: {
    enabled: false,
    mode: "2d",
    family: "prism",
    parameters: {
      angleBias: 0,
      bevel: 0.04,
      depth: 1.1,
      sideVariation: 0,
      sides: 6,
      size: 1.7,
      taper: 1,
      twist: 0,
    },
    rotation: 0,
    motionMappings: {
      angleBias: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      bevel: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      depth: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      sideVariation: {
        enabled: false,
        source: "rise-fall",
        amount: 0,
        invert: false,
      },
      sides: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      size: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      taper: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      twist: { enabled: false, source: "rise-fall", amount: 0, invert: false },
      rotation: {
        enabled: false,
        source: "rise-fall",
        amount: 0,
        invert: false,
      },
    },
  },
}

test("parses audio settings snapshots with an audio instance id", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_snapshot",
      audioInstanceId: "bass_instance-1",
      settings: validAudioSettings,
      updatedAt: 1000,
    }),
  )

  assert.equal(message?.type, "audio_settings_snapshot")
  assert.equal(message?.audioInstanceId, "bass_instance-1")
})

test("rejects audio settings updates with invalid audio instance ids", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_update",
      userId: "user-1",
      audioInstanceId: "../bass",
      settings: validAudioSettings,
      timestamp: 1000,
    }),
  )

  assert.equal(message, null)
})

test("parses audio worklet frames with route signals", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "stage_audio_frame",
      frame: {
        volume: 0.2,
        low: 0.3,
        mid: 0.4,
        high: 0.5,
        dominantBin: 12,
        spectrum: [0.1, 0.2, 0.3],
        source: "audio-worklet",
        sequence: 7,
        analysisRateHz: 60,
        routes: [
          {
            audioInstanceId: "audio-1",
            sampleStartPercent: 0,
            sampleEndPercent: 20,
            level: 0.4,
            fastLevel: 0.45,
            slowLevel: 0.3,
            floor: 0.1,
            peak: 0.8,
            riseAmount: 0.7,
            fallAmount: 0.1,
            riseRate: 0.8,
            fallRate: 0,
            triggered: true,
          },
        ],
        timestamp: 1000,
      },
      timestamp: 1001,
    }),
  )

  assert.equal(message?.type, "stage_audio_frame")
  assert.equal(message?.frame.source, "audio-worklet")
  assert.equal(message?.frame.routes?.[0]?.triggered, true)
})
