import assert from "node:assert/strict"
import { test } from "node:test"
import {
  advanceCenterShapeTransition,
  createManualToSpiralTransition,
  createSpiralToManualTransition,
  getManualToSpiralTransitionTransforms,
  getSpiralToManualTransitionTransforms,
} from "./centerShapeTransitionLogic.ts"

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

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `Expected ${actual} to be close to ${expected}`,
  )
}

test("center shape transition progress advances reliably over path duration", () => {
  const transition = createManualToSpiralTransition({
    audioInstanceId: "audio-1",
    origin: { x: 0, y: 0, z: 0 },
    settings: baseSettings,
  })

  const result = advanceCenterShapeTransition({
    dt: 1,
    transition,
  })

  assert.equal(result.transition.elapsedMs, 1000)
  assert.equal(result.progress, 0.25)
  assert.equal(result.done, false)
})

test("center shape transition completes without depending on modulation level", () => {
  const transition = createManualToSpiralTransition({
    audioInstanceId: "audio-1",
    origin: { x: 0, y: 0, z: 0 },
    settings: baseSettings,
  })

  const result = advanceCenterShapeTransition({
    dt: 4,
    transition,
  })

  assert.equal(result.transition.elapsedMs, 4000)
  assert.equal(result.progress, 1)
  assert.equal(result.done, true)
})

test("manual to spiral transition uses live target transforms while spiraling outward", () => {
  const transition = createManualToSpiralTransition({
    audioInstanceId: "audio-1",
    origin: { x: 0, y: 0, z: 0 },
    settings: baseSettings,
  })
  const targetTransforms = [
    {
      id: "spiral-1",
      pathIndex: 0,
      position: { x: 2, y: 1, z: -1 },
      phaseDegrees: 0,
      progress: 0,
      pulsesSinceBirth: 0,
    },
  ]

  const start = getManualToSpiralTransitionTransforms({
    progress: 0,
    targetTransforms,
    transition,
  })[0]
  const middle = getManualToSpiralTransitionTransforms({
    progress: 0.25,
    targetTransforms,
    transition,
  })[0]
  const end = getManualToSpiralTransitionTransforms({
    progress: 1,
    targetTransforms,
    transition,
  })[0]

  assert.deepEqual(start.position, { x: 0, y: 0, z: 0 })
  assertClose(
    Math.hypot(middle.position.x, middle.position.y),
    Math.hypot(2, 1) * 0.15625,
  )
  assert.notEqual(middle.position.x, 0.3125)
  assert.notEqual(middle.position.y, 0.15625)
  assertClose(middle.position.z, -0.15625)
  assertClose(end.position.x, 2)
  assertClose(end.position.y, 1)
  assertClose(end.position.z, -1)
})

test("spiral to manual transition spirals captured shapes inward", () => {
  const transition = createSpiralToManualTransition({
    audioInstanceId: "audio-1",
    settings: baseSettings,
    startTransforms: [
      {
        id: "spiral-1",
        pathIndex: 0,
        position: { x: 2, y: -1, z: 1 },
        phaseDegrees: 0,
        progress: 0,
        pulsesSinceBirth: 0,
      },
    ],
  })

  const start = getSpiralToManualTransitionTransforms({
    progress: 0,
    targetOrigin: { x: 0, y: 0, z: 0 },
    transition,
  })[0]
  const middle = getSpiralToManualTransitionTransforms({
    progress: 0.5,
    targetOrigin: { x: 0, y: 0, z: 0 },
    transition: {
      ...transition,
      elapsedMs: 1000,
    },
  })[0]
  const end = getSpiralToManualTransitionTransforms({
    progress: 1,
    targetOrigin: { x: 0, y: 0, z: 0 },
    transition,
  })[0]

  assert.deepEqual(start.position, { x: 2, y: -1, z: 1 })
  assert.notEqual(middle.position.x, 1)
  assert.notEqual(middle.position.y, -0.5)
  assert.deepEqual(end.position, { x: 0, y: 0, z: 0 })
})
