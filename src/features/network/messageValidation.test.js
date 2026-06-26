import assert from "node:assert/strict"
import { test } from "node:test"
import { parseVisualizerMessage } from "./messageValidation.ts"

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

test("parses audio settings updates with long center shape reset timers", () => {
  const settings = JSON.parse(JSON.stringify(validAudioSettings))
  settings.centerShape.motionMappings.positionX.resetMs = 60 * 60 * 1000

  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_update",
      userId: "user-1",
      audioInstanceId: "bass_instance-1",
      settings,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "audio_settings_update")
  assert.equal(
    message?.settings.centerShape.motionMappings.positionX.resetMs,
    60 * 60 * 1000,
  )
})

test("parses audio settings updates with center shape spiral motion", () => {
  const settings = JSON.parse(JSON.stringify(validAudioSettings))
  settings.centerShape.positionMode = "spiral"
  settings.centerShape.spiralMotion = {
    ...defaultSpiralMotionSettings,
    enabled: true,
    pathDurationMs: 24 * 60 * 60 * 1000,
    direction: "counterclockwise",
  }

  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_update",
      userId: "user-1",
      audioInstanceId: "bass_instance-1",
      settings,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "audio_settings_update")
  assert.equal(message?.settings.centerShape.positionMode, "spiral")
  assert.equal(
    message?.settings.centerShape.spiralMotion.pathDurationMs,
    24 * 60 * 60 * 1000,
  )
})

test("parses legacy center shape spiral reset timers", () => {
  const settings = JSON.parse(JSON.stringify(validAudioSettings))
  settings.centerShape.positionMode = "spiral"
  settings.centerShape.spiralMotion = {
    enabled: true,
    visualize: true,
    startRadius: 0.65,
    radiusSource: "smooth",
    radiusCvAmount: 0.25,
    degreesPerPulse: 180,
    depthPerPulse: 0.5,
    resetMs: 8000,
    direction: "clockwise",
    startPhaseDegrees: 0,
  }

  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_update",
      userId: "user-1",
      audioInstanceId: "bass_instance-1",
      settings,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "audio_settings_update")
  assert.equal(message?.settings.centerShape.spiralMotion.resetMs, 8000)
})

test("rejects audio settings updates with invalid center shape spiral settings", () => {
  const invalidDurationSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidDurationSettings.centerShape.positionMode = "spiral"
  invalidDurationSettings.centerShape.spiralMotion.pathDurationMs = -1

  const invalidPathCountSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidPathCountSettings.centerShape.spiralMotion.pathCount = 0

  const invalidSpawnRateSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidSpawnRateSettings.centerShape.spiralMotion.spawnRateHz = -0.1

  const invalidMoveSourceSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidMoveSourceSettings.centerShape.spiralMotion.moveSource = "sidechain"

  const invalidMoveRateSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidMoveRateSettings.centerShape.spiralMotion.moveRate = -0.1

  const invalidSpawnSourceSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidSpawnSourceSettings.centerShape.spiralMotion.spawnSource = "clock"

  const invalidMaxShapesSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidMaxShapesSettings.centerShape.spiralMotion.pathCount = 8
  invalidMaxShapesSettings.centerShape.spiralMotion.maxActiveShapes = 4

  const invalidDirectionSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidDirectionSettings.centerShape.spiralMotion.direction = "sideways"

  const invalidPositionModeSettings = JSON.parse(JSON.stringify(validAudioSettings))
  invalidPositionModeSettings.centerShape.positionMode = "orbit"

  for (const settings of [
    invalidDurationSettings,
    invalidPathCountSettings,
    invalidSpawnRateSettings,
    invalidMoveSourceSettings,
    invalidMoveRateSettings,
    invalidSpawnSourceSettings,
    invalidMaxShapesSettings,
    invalidDirectionSettings,
    invalidPositionModeSettings,
  ]) {
    const message = parseVisualizerMessage(
      JSON.stringify({
        type: "audio_settings_update",
        userId: "user-1",
        audioInstanceId: "bass_instance-1",
        settings,
        timestamp: 1000,
      }),
    )

    assert.equal(message, null)
  }
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

test("parses audio instance snapshots", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_instances_snapshot",
      instances: [
        {
          audioInstanceId: "audio-1",
          updatedAt: 1000,
        },
      ],
      timestamp: 1001,
    }),
  )

  assert.equal(message?.type, "audio_instances_snapshot")
  assert.equal(message?.instances[0]?.audioInstanceId, "audio-1")
})

test("parses audio settings delete messages", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "audio_settings_delete",
      audioInstanceId: "audio-1",
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "audio_settings_delete")
  assert.equal(message?.audioInstanceId, "audio-1")
})

test("parses audio patch page client roles", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "user_joined",
      userId: "user-1",
      color: "#00d1ff",
      role: "audio-patches",
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "user_joined")
  assert.equal(message?.role, "audio-patches")
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
        wledAudio: {
          volume: 0.25,
          bands: Array.from({ length: 16 }, () => 0.4),
          dominantFrequencyHz: 440,
        },
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
  assert.equal(message?.frame.wledAudio?.bands.length, 16)
})

test("parses song audio frames", () => {
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
        source: "song",
        sequence: 7,
        analysisRateHz: 60,
        routes: [],
        timestamp: 1000,
      },
      timestamp: 1001,
    }),
  )

  assert.equal(message?.type, "stage_audio_frame")
  assert.equal(message?.frame.source, "song")
})

test("parses WLED sync updates, tests, and snapshots", () => {
  const config = {
    mode: "multicast",
    unicastAddress: "192.168.1.50",
    port: 11988,
    gain: 1,
    noiseFloor: 0.02,
    peakThreshold: 0.7,
  }
  const update = parseVisualizerMessage(
    JSON.stringify({
      type: "wled_sync_update",
      config,
      enabled: true,
      timestamp: 1000,
    }),
  )
  const testMessage = parseVisualizerMessage(
    JSON.stringify({
      type: "wled_sync_test",
      timestamp: 1001,
    }),
  )
  const snapshot = parseVisualizerMessage(
    JSON.stringify({
      type: "wled_sync_snapshot",
      config,
      enabled: true,
      sending: true,
      activeSource: "song",
      packetCount: 20,
      lastSendAt: 1002,
      lastError: null,
      timestamp: 1003,
    }),
  )

  assert.equal(update?.type, "wled_sync_update")
  assert.equal(testMessage?.type, "wled_sync_test")
  assert.equal(snapshot?.type, "wled_sync_snapshot")
  assert.equal(snapshot?.activeSource, "song")
})

test("allows multicast WLED config without a unicast fallback address", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "wled_sync_update",
      config: {
        mode: "multicast",
        unicastAddress: "",
        port: 11988,
        gain: 1,
        noiseFloor: 0.02,
        peakThreshold: 0.7,
      },
      enabled: true,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "wled_sync_update")
})

test("rejects malformed WLED addresses and non-16-band audio frames", () => {
  const invalidUpdate = parseVisualizerMessage(
    JSON.stringify({
      type: "wled_sync_update",
      config: {
        mode: "unicast",
        unicastAddress: "999.1.1.1",
        port: 11988,
        gain: 1,
        noiseFloor: 0.02,
        peakThreshold: 0.7,
      },
      enabled: true,
      timestamp: 1000,
    }),
  )
  const invalidFrame = parseVisualizerMessage(
    JSON.stringify({
      type: "stage_audio_frame",
      frame: {
        volume: 0.2,
        low: 0.3,
        mid: 0.4,
        high: 0.5,
        dominantBin: 12,
        spectrum: [0.1, 0.2, 0.3],
        wledAudio: {
          volume: 0.25,
          bands: Array.from({ length: 15 }, () => 0.4),
          dominantFrequencyHz: 440,
        },
        timestamp: 1000,
      },
      timestamp: 1001,
    }),
  )

  assert.equal(invalidUpdate, null)
  assert.equal(invalidFrame, null)
})

test("parses song commands", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "song_command",
      command: "play",
      songId: "song_1",
      timeMs: 1200,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "song_command")
  assert.equal(message?.command, "play")
})

test("rejects invalid song commands", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "song_command",
      command: "play",
      songId: "../song",
      timestamp: 1000,
    }),
  )

  assert.equal(message, null)
})

test("parses song transport updates", () => {
  const message = parseVisualizerMessage(
    JSON.stringify({
      type: "song_transport_update",
      songId: "song_1",
      state: "playing",
      timeMs: 1200,
      durationMs: 3000,
      timestamp: 1000,
    }),
  )

  assert.equal(message?.type, "song_transport_update")
  assert.equal(message?.state, "playing")
})
