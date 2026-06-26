import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { isAudioCircleSettings } from "../../network/messageValidation.ts"
import { blendAudioSettings } from "./audioPatchFade.ts"
import {
  createAudioPatch,
  deleteAudioPatch,
  listAudioPatches,
} from "./audioPatchStorage.ts"

const defaultShapeMotionMapping = {
  enabled: false,
  source: "rise-fall",
  amount: 0,
  invert: false,
  mode: "oscillate",
  resetMs: 2000,
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
    spiralMotion: {
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
    },
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

function cloneSettings(patch = {}) {
  return {
    ...JSON.parse(JSON.stringify(validAudioSettings)),
    ...patch,
  }
}

test("creates, lists, and deletes saved audio patches", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "audio-patches-"))
  const filePath = path.join(directory, "patches.json")

  try {
    const patch = await createAudioPatch(
      {
        name: "  Bass   Bloom  ",
        settings: cloneSettings(),
      },
      {
        filePath,
        now: () => new Date("2026-06-26T12:00:00.000Z"),
      },
    )

    assert.match(patch.id, /^audio-patch-/)
    assert.equal(patch.name, "Bass Bloom")
    assert.equal(patch.createdAt, "2026-06-26T12:00:00.000Z")

    const patches = await listAudioPatches({ filePath })

    assert.equal(patches.length, 1)
    assert.equal(patches[0]?.id, patch.id)

    await deleteAudioPatch(patch.id, { filePath })

    assert.deepEqual(await listAudioPatches({ filePath }), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rejects saved audio patches with invalid settings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "audio-patches-"))
  const filePath = path.join(directory, "patches.json")
  const settings = cloneSettings({ gain: 99 })

  try {
    await assert.rejects(
      createAudioPatch({ name: "Too Hot", settings }, { filePath }),
      /Invalid audio patch settings/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("fades full audio settings across spectrum, visual cv, and stage shape modules", () => {
  const from = cloneSettings({
    circleColor: "#000000",
    centerShape: {
      ...cloneSettings().centerShape,
      color: "#000000",
    },
  })
  const to = cloneSettings({
    sampleStartPercent: 100,
    triggerMode: "adaptive",
    circleColor: "#ffffff",
    visualCv: {
      ...validAudioSettings.visualCv,
      envelope: {
        ...validAudioSettings.visualCv.envelope,
        threshold: 0.85,
      },
    },
    triggeredCircles: {
      ...validAudioSettings.triggeredCircles,
      triggerSource: "syncSine",
    },
    centerShape: {
      ...validAudioSettings.centerShape,
      enabled: true,
      mode: "3d",
      color: "#ffffff",
      parameters: {
        ...validAudioSettings.centerShape.parameters,
        sides: 24,
      },
      position: {
        ...validAudioSettings.centerShape.position,
        x: 1.5,
      },
      spiralMotion: {
        ...validAudioSettings.centerShape.spiralMotion,
        pathCount: 64,
        maxActiveShapes: 512,
      },
    },
  })
  const middle = blendAudioSettings(from, to, 0.5)
  const end = blendAudioSettings(from, to, 1)

  assert.equal(middle.sampleStartPercent, 50)
  assert.equal(middle.circleColor, "#808080")
  assert.equal(middle.triggerMode, "manual")
  assert.equal(middle.triggeredCircles.triggerSource, "range")
  assert.equal(middle.visualCv.envelope.threshold, 0.6)
  assert.equal(middle.centerShape.color, "#808080")
  assert.equal(middle.centerShape.enabled, false)
  assert.equal(middle.centerShape.parameters.sides, 15)
  assert.equal(middle.centerShape.position.x, 0.75)
  assert.equal(middle.centerShape.spiralMotion.pathCount, 36)
  assert.equal(isAudioCircleSettings(middle), true)

  assert.equal(end.triggerMode, "adaptive")
  assert.equal(end.triggeredCircles.triggerSource, "syncSine")
  assert.equal(end.centerShape.enabled, true)
  assert.equal(end.centerShape.mode, "3d")
  assert.equal(end.centerShape.parameters.sides, 24)
  assert.equal(isAudioCircleSettings(end), true)
})
