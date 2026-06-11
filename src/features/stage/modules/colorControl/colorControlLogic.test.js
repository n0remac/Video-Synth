import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applyColorControl,
  emptyColorControlState,
  receiveColorControl,
  resolveBackgroundColor,
  resolveDrawColor,
} from "./colorControlLogic.ts"

function createInput(overrides = {}) {
  return {
    userId: "user-a",
    source: "touch",
    target: "user",
    targetUserId: "user-a",
    mapping: "hue-brightness",
    x: 0,
    y: 0,
    baseColor: "#ff0000",
    amount: 1,
    timestamp: 1,
    ...overrides,
  }
}

test("maps touch values into HSV color controls", () => {
  assert.equal(applyColorControl(createInput({ x: 0.5, y: 0 })), "#00ffff")
  assert.equal(applyColorControl(createInput({ x: 0, y: 1 })), "#000000")
})

test("resolves selected user, all, and background targets", () => {
  const userState = receiveColorControl(
    emptyColorControlState,
    createInput({
      target: "user",
      targetUserId: "user-a",
      userId: "color-controller",
      x: 0.5,
      y: 0,
    }),
  )
  const allState = receiveColorControl(
    userState,
    createInput({ target: "all", userId: "user-b", x: 0.33, y: 0, timestamp: 2 }),
  )
  const backgroundState = receiveColorControl(
    allState,
    createInput({
      target: "background",
      userId: "user-c",
      x: 0.66,
      y: 0,
      timestamp: 3,
    }),
  )

  assert.notEqual(resolveDrawColor(backgroundState, "user-a", "#ffffff"), "#00ffff")
  assert.notEqual(resolveDrawColor(backgroundState, "user-b", "#ffffff"), "#ffffff")
  assert.notEqual(resolveBackgroundColor(backgroundState, "#000000"), "#000000")
})
