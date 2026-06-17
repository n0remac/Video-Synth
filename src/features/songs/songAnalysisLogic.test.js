import assert from "node:assert/strict"
import { test } from "node:test"
import {
  analyzeMonoSamples,
  getAverageSpectrumAhead,
  getFrameAtTime,
  getFramesInWindow,
  getPeakAhead,
} from "./songAnalysisLogic.ts"

test("analyzes silence into normalized frames", () => {
  const analysis = analyzeMonoSamples({
    songId: "song_1",
    samples: new Float32Array(44100),
    sampleRate: 44100,
    channelCount: 1,
    durationMs: 1000,
  })

  assert.equal(analysis.version, 1)
  assert.equal(analysis.frames.length > 0, true)
  assert.equal(analysis.frames[0].spectrum.length, 64)
  assert.equal(analysis.frames[0].controlSpectrum.length, 64)
  assert.equal(analysis.frames.every((frame) => frame.volume >= 0), true)
})

test("analyzes a generated tone with non-zero spectrum energy", () => {
  const sampleRate = 44100
  const samples = new Float32Array(sampleRate)

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((Math.PI * 2 * 440 * index) / sampleRate) * 0.5
  }

  const analysis = analyzeMonoSamples({
    songId: "song_1",
    samples,
    sampleRate,
    channelCount: 1,
    durationMs: 1000,
  })

  assert.equal(analysis.normalization.volumePeak > 0, true)
  assert.equal(analysis.frames.some((frame) => frame.dominantBin > 0), true)
})

test("finds frames and lookahead values on the analysis timeline", () => {
  const analysis = {
    version: 1,
    songId: "song_1",
    durationMs: 300,
    sampleRate: 1000,
    channelCount: 1,
    fftSize: 2048,
    hopSize: 16,
    analysisRateHz: 60,
    bucketCount: 2,
    windowFunction: "hann",
    normalization: {
      volumePeak: 0.9,
      lowPeak: 0.8,
      midPeak: 0.7,
      highPeak: 0.6,
    },
    frames: [
      {
        timeMs: 0,
        volume: 0.1,
        low: 0.1,
        mid: 0.1,
        high: 0.1,
        dominantBin: 0,
        spectrum: [0.1, 0.2],
        controlSpectrum: [0.2, 0.4],
      },
      {
        timeMs: 100,
        volume: 0.8,
        low: 0.4,
        mid: 0.3,
        high: 0.2,
        dominantBin: 1,
        spectrum: [0.7, 0.9],
        controlSpectrum: [0.6, 0.8],
      },
    ],
  }

  assert.equal(getFrameAtTime(analysis, 90)?.timeMs, 100)
  assert.equal(getFramesInWindow(analysis, 0, 50).length, 1)
  assert.equal(getPeakAhead(analysis, 0, 120, "volume").value, 0.8)
  const averageSpectrum = getAverageSpectrumAhead(analysis, 0, 120)
  assert.equal(Math.abs(averageSpectrum[0] - 0.4) < 0.000001, true)
  assert.equal(Math.abs(averageSpectrum[1] - 0.6) < 0.000001, true)
})
