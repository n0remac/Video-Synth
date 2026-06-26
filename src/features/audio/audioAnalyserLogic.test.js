import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createAudioAnalysisFrame,
  getDominantBin,
  normalizeSpectrum,
} from "./audioAnalyserLogic.ts"

test("finds the dominant frequency bin", () => {
  assert.equal(getDominantBin(Uint8Array.from([0, 10, 255, 20])), 2)
})

test("normalizes frequency data into spectrum buckets", () => {
  assert.deepEqual(
    normalizeSpectrum(Uint8Array.from([0, 255, 128, 64]), 2),
    [0.5, 0.3764705882352941],
  )
})

test("creates an audio analysis frame with normalized bands", () => {
  const timeDomainData = Float32Array.from([0.5, -0.5, 0.5, -0.5])
  const frame = createAudioAnalysisFrame(
    Uint8Array.from([0, 0, 255, 255, 128, 32, 0, 0]),
    123,
    4,
    {
      fftSize: 16,
      sampleRate: 16000,
      timeDomainData,
    },
  )

  assert.equal(frame.timestamp, 123)
  assert.equal(frame.dominantBin, 2)
  assert.equal(frame.spectrum.length, 4)
  assert.ok(frame.volume > 0)
  assert.ok(frame.mid > frame.high)
  assert.equal(frame.wledAudio?.bands.length, 16)
  assert.equal(frame.wledAudio?.volume, 0.5)
})
