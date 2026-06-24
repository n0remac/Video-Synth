import assert from "node:assert/strict"
import { test } from "node:test"
import { createCamera, resizeCameraToViewport } from "./createCamera.ts"

test("resizeCameraToViewport derives world width from explicit viewport size", () => {
  const camera = createCamera(1.125)
  const world = resizeCameraToViewport(camera, 1.125, {
    width: 1920,
    height: 1080,
  })

  assert.equal(world.worldHeight, 1.125)
  assert.equal(world.worldWidth, 2)
  assert.equal(camera.aspect, 1920 / 1080)
})

test("resizeCameraToViewport guards against zero viewport height", () => {
  const camera = createCamera(1)
  const world = resizeCameraToViewport(camera, 1, {
    width: 800,
    height: 0,
  })

  assert.equal(world.worldWidth, 800)
  assert.equal(world.worldHeight, 1)
  assert.equal(camera.aspect, 800)
})
