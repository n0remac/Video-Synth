import assert from "node:assert/strict"
import { test } from "node:test"
import {
  DEFAULT_AUDIO_INSTANCE_ID,
  normalizeAudioInstanceId,
} from "./audioInstanceIds.mjs"

test("normalizes valid generated audio instance ids", () => {
  assert.equal(
    normalizeAudioInstanceId("f4fbb8fc-7b08-4473-9a78-630868247aa7"),
    "f4fbb8fc-7b08-4473-9a78-630868247aa7",
  )
  assert.equal(normalizeAudioInstanceId("bass_instance-1"), "bass_instance-1")
})

test("falls back to default for missing or unsafe audio instance ids", () => {
  assert.equal(normalizeAudioInstanceId(null), DEFAULT_AUDIO_INSTANCE_ID)
  assert.equal(normalizeAudioInstanceId(""), DEFAULT_AUDIO_INSTANCE_ID)
  assert.equal(normalizeAudioInstanceId("../bass"), DEFAULT_AUDIO_INSTANCE_ID)
})
