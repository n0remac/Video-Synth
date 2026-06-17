import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createAudioSettingsUpdateMessage,
  getVisualizerSocketUrl,
} from "./protocol.ts"

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

test("creates audio settings updates with an audio instance id", () => {
  const message = createAudioSettingsUpdateMessage({
    type: "audio_settings_update",
    userId: "user-1",
    audioInstanceId: "instance-1",
    settings: validAudioSettings,
    timestamp: 1000,
  })

  assert.equal(message.audioInstanceId, "instance-1")
  assert.deepEqual(message.settings, validAudioSettings)
})

test("adds audio instance ids to audio websocket urls", () => {
  const originalWindow = globalThis.window

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        protocol: "http:",
        host: "localhost:3000",
      },
    },
  })

  try {
    assert.equal(
      getVisualizerSocketUrl("audio", { audioInstanceId: "instance-1" }),
      "ws://localhost:3000/ws?role=audio&audioInstanceId=instance-1",
    )
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      })
    }
  }
})
