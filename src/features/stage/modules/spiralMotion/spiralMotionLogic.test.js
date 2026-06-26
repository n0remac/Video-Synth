import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createSpiralMotionRuntimeState,
  getSpiralEffectiveRadiusScale,
  getSpiralInstanceTransforms,
  getSpiralMovementAdvanceMs,
  getSpiralPathAnglesDegrees,
  shouldResetSpiralMotionRuntime,
  updateSpiralMotionRuntimeState,
} from "./spiralMotionLogic.ts"

const baseSettings = {
  enabled: true,
  visualize: true,
  startRadius: 1,
  radiusSource: "level",
  radiusCvAmount: 0,
  moveSource: "syncSine",
  moveRate: 1,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  pathDurationMs: 4000,
  pathCount: 4,
  spawnSource: "syncSine",
  spawnRateHz: 1,
  maxActiveShapes: 128,
  edgePadding: 0,
  direction: "counterclockwise",
  startPhaseDegrees: 0,
}

const world = {
  worldWidth: 2,
  worldHeight: 1,
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
    syncSine: 1,
    frequencyHz: 2,
    rangeTriggered: false,
    envelopeTriggered: false,
    syncSineTriggered: false,
    ...patch,
  }
}

function update(state, patch = {}) {
  return updateSpiralMotionRuntimeState({
    dt: patch.dt ?? 0,
    settings: patch.settings ?? baseSettings,
    signal: patch.signal ?? createSignal(),
    state,
  }).state
}

test("spiral path count produces evenly spaced path angles", () => {
  assert.deepEqual(getSpiralPathAnglesDegrees(baseSettings), [0, 90, 180, 270])
})

test("spiral path count one creates exactly one path", () => {
  assert.deepEqual(
    getSpiralPathAnglesDegrees({
      ...baseSettings,
      pathCount: 1,
      startPhaseDegrees: 45,
    }),
    [45],
  )
})

test("spiral update spawns one full initial ring", () => {
  const state = update(createSpiralMotionRuntimeState())

  assert.equal(state.instances.length, baseSettings.pathCount)
  assert.deepEqual(
    state.instances.map((instance) => instance.pathIndex),
    [0, 1, 2, 3],
  )
})

test("spiral spawn frequency creates additional full rings on schedule", () => {
  const settings = {
    ...baseSettings,
    spawnRateHz: 2,
  }
  const signal = createSignal({ frequencyHz: 1 })
  let state = update(createSpiralMotionRuntimeState(), { settings, signal })

  state = update(state, { dt: 0.49, settings, signal })
  assert.equal(state.instances.length, 4)

  state = update(state, { dt: 0.01, settings, signal })
  assert.equal(state.instances.length, 8)
})

test("spiral spawn rate zero creates only the initial ring", () => {
  const settings = {
    ...baseSettings,
    moveRate: 0,
    spawnRateHz: 0,
  }
  let state = update(createSpiralMotionRuntimeState(), { settings })

  state = update(state, { dt: 3, settings })

  assert.equal(state.instances.length, 4)
})

test("spiral movement advances from selected pulse-synced source and move rate", () => {
  const settings = {
    ...baseSettings,
    moveSource: "level",
    moveRate: 2,
    pathDurationMs: 4000,
    spawnRateHz: 0,
  }
  let state = update(createSpiralMotionRuntimeState(), {
    settings,
    signal: createSignal({ frequencyHz: 1, level: 0 }),
  })

  state = update(state, {
    dt: 1,
    settings,
    signal: createSignal({ frequencyHz: 1, level: 0 }),
  })
  assert.equal(state.instances[0].ageMs, 0)

  state = update(state, {
    dt: 1,
    settings,
    signal: createSignal({ frequencyHz: 1, level: 0.5 }),
  })

  assert.equal(state.instances[0].ageMs, 1000)
})

test("spiral movement advance can be reused for music-synced transitions", () => {
  assert.equal(
    getSpiralMovementAdvanceMs({
      dt: 1,
      settings: baseSettings,
      signal: createSignal({ frequencyHz: 2, syncSine: 1 }),
    }),
    2000,
  )
})

test("spiral movement advance falls back to elapsed time only when requested", () => {
  assert.equal(
    getSpiralMovementAdvanceMs({
      dt: 0.25,
      fallbackToElapsed: true,
      settings: baseSettings,
      signal: null,
    }),
    250,
  )
  assert.equal(
    getSpiralMovementAdvanceMs({
      dt: 0.25,
      settings: baseSettings,
      signal: null,
    }),
    0,
  )
})

test("spiral runtime reset ignores numeric movement-only setting changes", () => {
  assert.equal(
    shouldResetSpiralMotionRuntime({
      previousSettings: baseSettings,
      nextSettings: {
        ...baseSettings,
        moveRate: 2,
        pathDurationMs: 8000,
        spawnRateHz: 2,
      },
    }),
    false,
  )
  assert.equal(
    shouldResetSpiralMotionRuntime({
      previousSettings: baseSettings,
      nextSettings: {
        ...baseSettings,
        pathCount: 8,
      },
    }),
    true,
  )
})

test("spiral spawn scheduling advances from selected pulse-synced source", () => {
  const settings = {
    ...baseSettings,
    pathCount: 2,
    spawnSource: "level",
    spawnRateHz: 1,
  }
  let state = update(createSpiralMotionRuntimeState(), {
    settings,
    signal: createSignal({ frequencyHz: 1, level: 0 }),
  })

  state = update(state, {
    dt: 2,
    settings,
    signal: createSignal({ frequencyHz: 1, level: 0 }),
  })
  assert.equal(state.instances.length, 2)

  state = update(state, {
    dt: 1,
    settings,
    signal: createSignal({ frequencyHz: 1, level: 1 }),
  })

  assert.equal(state.instances.length, 4)
})

test("spiral repeated spawns create multiple shapes per path", () => {
  const settings = {
    ...baseSettings,
    pathCount: 2,
    spawnRateHz: 1,
  }
  const signal = createSignal({ frequencyHz: 1 })
  let state = update(createSpiralMotionRuntimeState(), { settings, signal })
  state = update(state, { dt: 1, settings, signal })
  state = update(state, { dt: 1, settings, signal })

  assert.equal(state.instances.length, 6)
  assert.equal(
    state.instances.filter((instance) => instance.pathIndex === 0).length,
    3,
  )
  assert.equal(
    state.instances.filter((instance) => instance.pathIndex === 1).length,
    3,
  )
})

test("spiral shapes are pruned after path duration", () => {
  const settings = {
    ...baseSettings,
    pathDurationMs: 1000,
    spawnRateHz: 0,
  }
  let state = update(createSpiralMotionRuntimeState(), { settings })

  state = update(state, { dt: 1, settings })

  assert.equal(state.instances.length, 0)
})

test("spiral max active shapes caps oldest instances", () => {
  const settings = {
    ...baseSettings,
    pathCount: 2,
    spawnRateHz: 10,
    maxActiveShapes: 4,
  }
  const signal = createSignal({ frequencyHz: 1 })
  let state = update(createSpiralMotionRuntimeState(), { settings, signal })
  state = update(state, { dt: 0.1, settings, signal })
  state = update(state, { dt: 0.1, settings, signal })

  assert.equal(state.instances.length, 4)
  assert.deepEqual(
    state.instances.map((instance) => instance.id),
    ["spiral-3", "spiral-4", "spiral-5", "spiral-6"],
  )
})

test("spiral phase and z move by pulse count since birth", () => {
  let state = update(createSpiralMotionRuntimeState())
  state = update(state, { dt: 0.5, signal: createSignal({ frequencyHz: 2 }) })

  const transform = getSpiralInstanceTransforms({
    origin: { x: 0, y: 0, z: 0 },
    settings: baseSettings,
    signal: createSignal({ frequencyHz: 2 }),
    state,
    world,
  })[0]

  assertClose(transform.phaseDegrees, 180)
  assertClose(transform.position.z, -0.5)
})

test("spiral radius cv modulation affects screen-edge radius scale", () => {
  const settings = {
    ...baseSettings,
    radiusCvAmount: 0.4,
  }
  const radiusScale = getSpiralEffectiveRadiusScale(
    settings,
    createSignal({ level: 0.5 }),
  )
  const state = update(createSpiralMotionRuntimeState(), {
    settings,
    signal: createSignal({ level: 0.5 }),
  })
  const transform = getSpiralInstanceTransforms({
    origin: { x: 0, y: 0, z: 0 },
    settings,
    signal: createSignal({ level: 0.5 }),
    state,
    world,
  })[0]

  assertClose(radiusScale, 1.2)
  assertClose(transform.position.x, 1.2)
})
