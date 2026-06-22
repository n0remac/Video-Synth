import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createAudioSettingsUpdateMessage,
  getVisualizerSocketUrl,
} from "./protocol.ts"

const defaultShapeMotionMapping = {
  enabled: false,
  source: "rise-fall",
  amount: 0,
  invert: false,
  mode: "oscillate",
  resetMs: 2000,
}

const defaultSpiralMotionSettings = {
  enabled: false,
  visualize: true,
  startRadius: 1,
  radiusSource: "smooth",
  radiusCvAmount: 0.25,
  moveSource: "syncSine",
  moveRate: 1,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  pathDurationMs: 4000,
  pathCount: 8,
  spawnSource: "syncSine",
  spawnRateHz: 0.5,
  maxActiveShapes: 128,
  edgePadding: 0.06,
  direction: "clockwise",
  startPhaseDegrees: 0,
}

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
  triggeredCircles: {
    triggerSource: "range",
    sizeSource: "level",
    growSource: "rise",
    releaseSource: "fall",
  },
  visualCv: {
    smooth: {
      input: "level",
      riseMs: 180,
      fallMs: 320,
    },
    envelope: {
      threshold: 0.35,
      attackMs: 80,
      decayMs: 420,
      cooldownMs: 180,
    },
    syncSine: {
      input: "motion",
      threshold: 0.35,
      hysteresis: 0.08,
      cooldownMs: 160,
      lengthMultiple: 2,
      phaseMode: "peakOnSpike",
      syncMode: "soft",
      historyMs: 6000,
      periodSmoothMs: 300,
      phaseCorrectionAmount: 0.15,
    },
  },
  centerShape: {
    enabled: false,
    mode: "2d",
    family: "prism",
    color: "#00d1ff",
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
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    positionMode: "manual",
    spiralMotion: { ...defaultSpiralMotionSettings },
    motionMappings: {
      angleBias: { ...defaultShapeMotionMapping },
      bevel: { ...defaultShapeMotionMapping },
      depth: { ...defaultShapeMotionMapping },
      sideVariation: { ...defaultShapeMotionMapping },
      sides: { ...defaultShapeMotionMapping },
      size: { ...defaultShapeMotionMapping },
      taper: { ...defaultShapeMotionMapping },
      twist: { ...defaultShapeMotionMapping },
      positionX: { ...defaultShapeMotionMapping },
      positionY: { ...defaultShapeMotionMapping },
      positionZ: { ...defaultShapeMotionMapping },
      rotationX: { ...defaultShapeMotionMapping },
      rotationY: { ...defaultShapeMotionMapping },
      rotationZ: { ...defaultShapeMotionMapping },
      colorHue: { ...defaultShapeMotionMapping },
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
