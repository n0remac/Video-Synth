import assert from "node:assert/strict"
import { test } from "node:test"
import {
  addTrailPoint,
  maxTrailLineCount,
  maxTrailLength,
  minTrailLineCount,
  minTrailLength,
  updateTrailPaintState,
} from "./trailPaintLogic.ts"

function createInput(overrides = {}) {
  return {
    userId: "user-a",
    x: 0,
    y: 0,
    vx: 1,
    vy: 0,
    color: "#ffffff",
    down: true,
    lineCount: 3,
    trailLength: 1,
    ...overrides,
  }
}

test("clamps trail line count and trail length", () => {
  const lowState = addTrailPoint(
    { trails: {} },
    createInput({ lineCount: -10, trailLength: -1 }),
  )
  const highState = addTrailPoint(
    { trails: {} },
    createInput({ lineCount: 99, trailLength: 99 }),
  )

  assert.equal(lowState.trails["user-a"].lineCount, minTrailLineCount)
  assert.equal(lowState.trails["user-a"].trailLength, minTrailLength)
  assert.equal(highState.trails["user-a"].lineCount, maxTrailLineCount)
  assert.equal(highState.trails["user-a"].trailLength, maxTrailLength)
})

test("retains points only within the configured trail length", () => {
  const first = addTrailPoint(
    { trails: {} },
    createInput({ x: 0, trailLength: 0.5 }),
  )
  const aged = updateTrailPaintState(first, 0.35)
  const second = addTrailPoint(aged, createInput({ x: 1, trailLength: 0.5 }))
  const trimmed = updateTrailPaintState(second, 0.2)

  assert.equal(trimmed.trails["user-a"].points.length, 1)
  assert.equal(trimmed.trails["user-a"].points[0].x, 1)
})

test("inactive trails fade out when no new points are added", () => {
  const started = addTrailPoint(
    { trails: {} },
    createInput({ trailLength: 0.3 }),
  )
  const released = addTrailPoint(
    started,
    createInput({ down: false, trailLength: 0.3 }),
  )
  const faded = updateTrailPaintState(released, 0.4)

  assert.deepEqual(faded.trails, {})
})
