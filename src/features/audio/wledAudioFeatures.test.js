import assert from "node:assert/strict"
import { test } from "node:test"
import {
  calculateRms,
  createWledAudioFromByteFrequencyData,
  createWledAudioFromComplexSpectrum,
} from "./wledAudioFeatures.ts"

test("calculates normalized RMS volume", () => {
  assert.equal(calculateRms(Float32Array.from([1, -1, 1, -1])), 1)
  assert.equal(calculateRms(new Float32Array(8)), 0)
})

test("maps FFT bins directly into the WLED frequency bands", () => {
  const fftSize = 2048
  const sampleRate = 44100
  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)
  const toneBin = Math.round((440 * fftSize) / sampleRate)

  real[toneBin] = fftSize / 2

  const frame = createWledAudioFromComplexSpectrum({
    fftSize,
    real,
    imag,
    rmsVolume: 0.5,
    sampleRate,
  })

  const strongestBand = frame.bands.indexOf(Math.max(...frame.bands))

  assert.equal(frame.bands.length, 16)
  assert.equal(strongestBand, 5)
  assert.ok(Math.abs(frame.dominantFrequencyHz - 440) < 15)
  assert.equal(frame.volume, 0.5)
})

test("maps analyser byte data using the real FFT frequency scale", () => {
  const fftSize = 2048
  const sampleRate = 48000
  const frequencyData = new Uint8Array(fftSize / 2)
  const toneBin = Math.round((1000 * fftSize) / sampleRate)

  frequencyData[toneBin] = 255

  const frame = createWledAudioFromByteFrequencyData({
    fftSize,
    frequencyData,
    rmsVolume: 0.25,
    sampleRate,
  })

  assert.equal(frame.bands.indexOf(Math.max(...frame.bands)), 7)
  assert.ok(Math.abs(frame.dominantFrequencyHz - 1000) < 15)
})
