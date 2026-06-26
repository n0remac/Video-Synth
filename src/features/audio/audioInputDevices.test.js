import assert from "node:assert/strict"
import { test } from "node:test"
import {
  getAudioInputDeviceOptions,
  resolveSelectedAudioInputDeviceId,
  systemAudioInputDeviceId,
} from "./audioInputDevices.ts"

test("keeps system default first and filters to audio inputs", () => {
  const options = getAudioInputDeviceOptions([
    { deviceId: "camera-1", kind: "videoinput", label: "Camera" },
    { deviceId: "usb-1", kind: "audioinput", label: "USB Audio Device" },
    { deviceId: "output-1", kind: "audiooutput", label: "Speakers" },
  ])

  assert.equal(options.length, 2)
  assert.equal(options[0].deviceId, systemAudioInputDeviceId)
  assert.equal(options[0].label, "System default")
  assert.equal(options[0].systemDefault, true)
  assert.equal(options[1].deviceId, "usb-1")
  assert.equal(options[1].label, "USB Audio Device")
})

test("uses fallback labels when browser labels are hidden", () => {
  const options = getAudioInputDeviceOptions([
    { deviceId: "input-1", kind: "audioinput", label: "" },
    { deviceId: "input-2", kind: "audioinput", label: "   " },
  ])

  assert.equal(options[1].label, "Audio input 1")
  assert.equal(options[2].label, "Audio input 2")
})

test("resolves saved device ids against available options", () => {
  const options = getAudioInputDeviceOptions([
    { deviceId: "usb-1", kind: "audioinput", label: "USB Audio Device" },
  ])

  assert.equal(resolveSelectedAudioInputDeviceId(options, "usb-1"), "usb-1")
  assert.equal(
    resolveSelectedAudioInputDeviceId(options, "missing-device"),
    systemAudioInputDeviceId,
  )
  assert.equal(
    resolveSelectedAudioInputDeviceId(options, null),
    systemAudioInputDeviceId,
  )
})
