import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import {
  createSyntheticWledAudioFrame,
  createWledAudioSyncPacket,
  createWledSignalState,
  createWledSyncRuntime,
  defaultWledSyncConfig,
  isWledSyncConfig,
  loadWledSyncConfig,
  processWledAudioFrame,
  saveWledSyncConfig,
} from "./wledSync.mjs"

test("packs the 44-byte WLED V2 audio-sync layout", () => {
  const packet = createWledAudioSyncPacket({
    rawVolume: 42.5,
    smoothedVolume: 30.25,
    peak: true,
    bands: Array.from({ length: 16 }, (_, index) => index),
    dominantFrequencyHz: 120,
  })

  assert.equal(packet.length, 44)
  assert.equal(packet.subarray(0, 6).toString("hex"), "303030303200")
  assert.equal(packet.readFloatLE(8), 42.5)
  assert.equal(packet.readFloatLE(12), 30.25)
  assert.equal(packet[16], 1)
  assert.deepEqual(
    Array.from(packet.subarray(18, 34)),
    Array.from({ length: 16 }, (_, index) => index),
  )
  assert.equal(packet.readUInt16LE(34), 0)
  assert.equal(packet.readFloatLE(36), 15)
  assert.equal(packet.readFloatLE(40), 120)
})

test("validates persisted multicast and unicast configuration", () => {
  assert.equal(isWledSyncConfig(defaultWledSyncConfig), true)
  assert.equal(
    isWledSyncConfig({
      ...defaultWledSyncConfig,
      mode: "multicast",
      unicastAddress: "",
    }),
    true,
  )
  assert.equal(
    isWledSyncConfig({
      ...defaultWledSyncConfig,
      mode: "unicast",
      unicastAddress: "192.168.1.50",
    }),
    true,
  )
  assert.equal(
    isWledSyncConfig({
      ...defaultWledSyncConfig,
      mode: "unicast",
      unicastAddress: "999.1.1.1",
    }),
    false,
  )
  assert.equal(
    isWledSyncConfig({ ...defaultWledSyncConfig, port: 70000 }),
    false,
  )
})

test("persists configuration without an enabled flag", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "video-synth-wled-"))
  const configPath = path.join(directory, "config.json")
  const config = {
    ...defaultWledSyncConfig,
    mode: "unicast",
    unicastAddress: "10.0.0.20",
    gain: 1.8,
  }

  await saveWledSyncConfig(configPath, config)

  assert.deepEqual(await loadWledSyncConfig(configPath), config)
  assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), config)
})

test("applies noise floor, smoothing, and rising-edge peak detection", () => {
  const config = {
    ...defaultWledSyncConfig,
    noiseFloor: 0.1,
    peakThreshold: 0.1,
  }
  const quiet = processWledAudioFrame({
    config,
    frame: {
      volume: 0.05,
      bands: Array.from({ length: 16 }, () => 0.05),
      dominantFrequencyHz: 100,
    },
    previousState: createWledSignalState(),
    timestamp: 25,
  })
  const loud = processWledAudioFrame({
    config,
    frame: {
      volume: 1,
      bands: Array.from({ length: 16 }, () => 1),
      dominantFrequencyHz: 100,
    },
    previousState: quiet.state,
    timestamp: 50,
  })
  const sustained = processWledAudioFrame({
    config,
    frame: {
      volume: 1,
      bands: Array.from({ length: 16 }, () => 1),
      dominantFrequencyHz: 100,
    },
    previousState: loud.state,
    timestamp: 75,
  })

  assert.equal(quiet.packet.readFloatLE(8), 0)
  assert.equal(loud.packet[16], 1)
  assert.equal(sustained.packet[16], 0)
  assert.ok(loud.packet.readFloatLE(12) < loud.packet.readFloatLE(8))
})

test("runtime starts disabled, owns one stage, throttles, and clears stale audio", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "video-synth-wled-"))
  const sent = []
  let tick = () => {}
  let now = 0
  let multicastTtl = null
  let closed = false
  const fakeSocket = {
    on() {},
    setMulticastTTL(value) {
      multicastTtl = value
    },
    send(packet, port, address, callback) {
      sent.push({ packet: Buffer.from(packet), port, address })
      callback()
    },
    close() {
      closed = true
    },
  }
  const runtime = await createWledSyncRuntime({
    configPath: path.join(directory, "config.json"),
    now: () => now,
    createSocket: () => fakeSocket,
    setIntervalFn(callback) {
      tick = callback
      return 1
    },
    clearIntervalFn() {},
  })

  assert.equal(runtime.getSnapshot().enabled, false)
  await runtime.update({ ...defaultWledSyncConfig }, true)

  const firstFrame = {
    source: "audio-worklet",
    wledAudio: {
      volume: 0.8,
      bands: Array.from({ length: 16 }, () => 0.5),
      dominantFrequencyHz: 80,
    },
  }
  const secondFrame = {
    source: "song",
    wledAudio: {
      volume: 1,
      bands: Array.from({ length: 16 }, () => 1),
      dominantFrequencyHz: 440,
    },
  }

  assert.equal(runtime.receiveFrame("stage-1", firstFrame, now), true)
  assert.equal(runtime.receiveFrame("stage-2", secondFrame, now), false)
  tick()
  tick()

  assert.equal(sent.length, 1)
  assert.equal(sent[0].address, "239.0.0.1")
  assert.equal(sent[0].port, 11988)
  assert.equal(sent[0].packet.readFloatLE(40), 80)
  assert.equal(multicastTtl, 2)

  now = 300
  tick()
  assert.equal(sent.length, 2)
  assert.equal(sent[1].packet.readFloatLE(8), 0)
  assert.equal(runtime.getSnapshot().sending, false)

  await runtime.update(
    {
      ...defaultWledSyncConfig,
      mode: "unicast",
      unicastAddress: "192.168.1.77",
    },
    true,
  )
  assert.equal(runtime.receiveFrame("stage-2", secondFrame, now), true)
  now = 325
  tick()
  assert.equal(sent.at(-1).address, "192.168.1.77")
  assert.equal(sent.at(-1).packet.readFloatLE(40), 440)

  runtime.close()
  assert.equal(closed, true)
})

test("runtime exposes the fixed five-second bass test source", async () => {
  let tick = () => {}
  let now = 100
  const sent = []
  const runtime = await createWledSyncRuntime({
    configPath: path.join(
      await mkdtemp(path.join(tmpdir(), "video-synth-wled-")),
      "config.json",
    ),
    now: () => now,
    createSocket: () => ({
      on() {},
      setMulticastTTL() {},
      send(packet, port, address, callback) {
        sent.push(Buffer.from(packet))
        callback()
      },
      close() {},
    }),
    setIntervalFn(callback) {
      tick = callback
      return 1
    },
    clearIntervalFn() {},
  })

  assert.equal(runtime.startTest(), false)
  await runtime.update({ ...defaultWledSyncConfig }, true)
  assert.equal(runtime.startTest(), true)
  tick()
  assert.equal(runtime.getSnapshot().activeSource, "test")
  assert.equal(sent[0].readFloatLE(40), 40)

  now += 5001
  tick()
  assert.equal(runtime.getSnapshot().activeSource, null)
  runtime.close()
})

test("runtime reports UDP send errors without throwing", async () => {
  let tick = () => {}
  const runtime = await createWledSyncRuntime({
    configPath: path.join(
      await mkdtemp(path.join(tmpdir(), "video-synth-wled-")),
      "config.json",
    ),
    now: () => 25,
    createSocket: () => ({
      on() {},
      setMulticastTTL() {},
      send(packet, port, address, callback) {
        callback(new Error("network unavailable"))
      },
      close() {},
    }),
    setIntervalFn(callback) {
      tick = callback
      return 1
    },
    clearIntervalFn() {},
  })

  await runtime.update({ ...defaultWledSyncConfig }, true)
  runtime.receiveFrame("stage-1", {
    source: "audio-worklet",
    wledAudio: {
      volume: 0.8,
      bands: Array.from({ length: 16 }, () => 0.5),
      dominantFrequencyHz: 80,
    },
  })
  tick()

  assert.equal(runtime.getSnapshot().lastError, "network unavailable")
  assert.equal(runtime.getSnapshot().packetCount, 0)
  runtime.close()
})

test("creates a normalized synthetic test frame", () => {
  const frame = createSyntheticWledAudioFrame(125)

  assert.equal(frame.bands.length, 16)
  assert.equal(frame.dominantFrequencyHz, 40)
  assert.equal(frame.bands.every((value) => value >= 0 && value <= 1), true)
})
