import assert from "node:assert/strict"
import { test } from "node:test"
import {
  getSpiralGeometrySignature,
  getSpiralInstanceScale,
  isShapeSizeGeometryBound,
} from "./centerShapeGeometryLogic.ts"

const baseParameters = {
  angleBias: 0,
  bevel: 0,
  depth: 1.1,
  sideVariation: 0,
  sides: 6,
  size: 1,
  taper: 1,
  twist: 0,
}

function createShape(patch = {}) {
  return {
    family: "prism",
    mode: "3d",
    parameters: baseParameters,
    ...patch,
    parameters: {
      ...baseParameters,
      ...patch.parameters,
    },
  }
}

test("spiral geometry signature ignores size for scalable 2d shapes", () => {
  const small = createShape({
    mode: "2d",
    parameters: { size: 1 },
  })
  const large = createShape({
    mode: "2d",
    parameters: { size: 2.4 },
  })

  assert.equal(getSpiralGeometrySignature(small), getSpiralGeometrySignature(large))
  assert.deepEqual(getSpiralInstanceScale(large), { x: 2.4, y: 2.4, z: 1 })
})

test("spiral geometry signature ignores size for unbeveled prisms", () => {
  const small = createShape({
    family: "prism",
    parameters: { bevel: 0, size: 1 },
  })
  const large = createShape({
    family: "prism",
    parameters: { bevel: 0, size: 2.2 },
  })

  assert.equal(getSpiralGeometrySignature(small), getSpiralGeometrySignature(large))
  assert.deepEqual(getSpiralInstanceScale(large), { x: 2.2, y: 2.2, z: 1 })
})

test("spiral geometry signature keeps size for beveled prisms", () => {
  const small = createShape({
    family: "prism",
    parameters: { bevel: 0.08, size: 1 },
  })
  const large = createShape({
    family: "prism",
    parameters: { bevel: 0.08, size: 2.2 },
  })

  assert.equal(isShapeSizeGeometryBound(small), true)
  assert.notEqual(getSpiralGeometrySignature(small), getSpiralGeometrySignature(large))
  assert.deepEqual(getSpiralInstanceScale(large), { x: 1, y: 1, z: 1 })
})

test("spiral instance scale applies size uniformly for spheres", () => {
  const sphere = createShape({
    family: "sphere",
    parameters: { size: 1.8 },
  })

  assert.equal(isShapeSizeGeometryBound(sphere), false)
  assert.deepEqual(getSpiralInstanceScale(sphere), { x: 1.8, y: 1.8, z: 1.8 })
})
