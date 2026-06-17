import assert from "node:assert/strict"
import { test } from "node:test"
import { isSongAnalysis, isSongId } from "./songValidation.ts"

test("validates safe song ids", () => {
  assert.equal(isSongId("song-abc_123"), true)
  assert.equal(isSongId("../song"), false)
  assert.equal(isSongId(""), false)
})

test("validates saved song analysis shape", () => {
  const frame = {
    timeMs: 0,
    volume: 0,
    low: 0,
    mid: 0,
    high: 0,
    dominantBin: 0,
    spectrum: Array.from({ length: 64 }, () => 0),
    controlSpectrum: Array.from({ length: 64 }, () => 0),
  }

  assert.equal(
    isSongAnalysis({
      version: 1,
      songId: "song_1",
      durationMs: 1000,
      sampleRate: 44100,
      channelCount: 1,
      fftSize: 2048,
      hopSize: 735,
      analysisRateHz: 60,
      bucketCount: 64,
      windowFunction: "hann",
      normalization: {
        volumePeak: 0,
        lowPeak: 0,
        midPeak: 0,
        highPeak: 0,
      },
      frames: [frame],
    }),
    true,
  )
})
