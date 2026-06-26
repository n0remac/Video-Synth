import dgram from "node:dgram"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isIP } from "node:net"
import path from "node:path"

export const WLED_MULTICAST_ADDRESS = "239.0.0.1"
export const WLED_AUDIO_SYNC_RATE_HZ = 40
export const WLED_AUDIO_STALE_MS = 250
export const WLED_TEST_DURATION_MS = 5000

export const defaultWledSyncConfig = Object.freeze({
  mode: "multicast",
  unicastAddress: "192.168.1.123",
  port: 11988,
  gain: 1,
  noiseFloor: 0.02,
  peakThreshold: 0.7,
})

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isNormalized(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

export function isWledSyncConfig(value) {
  return (
    value &&
    (value.mode === "multicast" || value.mode === "unicast") &&
    typeof value.unicastAddress === "string" &&
    (value.mode === "multicast" || isIP(value.unicastAddress) === 4) &&
    Number.isInteger(value.port) &&
    value.port >= 1 &&
    value.port <= 65535 &&
    isFiniteNumber(value.gain) &&
    value.gain >= 0.1 &&
    value.gain <= 6 &&
    isNormalized(value.noiseFloor) &&
    value.noiseFloor <= 0.5 &&
    isNormalized(value.peakThreshold)
  )
}

export function isWledAudioFrame(value) {
  return (
    value &&
    isNormalized(value.volume) &&
    Array.isArray(value.bands) &&
    value.bands.length === 16 &&
    value.bands.every(isNormalized) &&
    isFiniteNumber(value.dominantFrequencyHz) &&
    value.dominantFrequencyHz >= 0
  )
}

export function createWledAudioSyncPacket({
  bands,
  dominantFrequencyHz,
  peak,
  rawVolume,
  smoothedVolume,
}) {
  if (!Array.isArray(bands) || bands.length !== 16) {
    throw new Error("WLED audio sync requires exactly 16 frequency bands.")
  }

  const packet = Buffer.alloc(44)
  const fftBands = bands.map((value) =>
    Math.round(clamp(Number(value) || 0, 0, 255)),
  )

  packet.write("00002", 0, "ascii")
  packet[5] = 0
  packet.writeFloatLE(clamp(rawVolume, 0, 255), 8)
  packet.writeFloatLE(clamp(smoothedVolume, 0, 255), 12)
  packet[16] = peak ? 1 : 0

  fftBands.forEach((value, index) => {
    packet[18 + index] = value
  })

  packet.writeFloatLE(Math.max(...fftBands, 0), 36)
  packet.writeFloatLE(Math.max(0, dominantFrequencyHz), 40)

  return packet
}

export function createWledSignalState() {
  return {
    smoothedVolume: 0,
    smoothedBands: Array.from({ length: 16 }, () => 0),
    abovePeakThreshold: false,
    lastProcessedAt: null,
  }
}

function applyNoiseFloorAndGain(value, config) {
  const normalized =
    value <= config.noiseFloor
      ? 0
      : (value - config.noiseFloor) / Math.max(1 - config.noiseFloor, 0.0001)

  return clamp(normalized * config.gain, 0, 1)
}

function smoothValue(previous, target, deltaMs) {
  const timeConstantMs = target >= previous ? 60 : 300
  const amount = 1 - Math.exp(-Math.max(deltaMs, 1) / timeConstantMs)

  return previous + (target - previous) * amount
}

export function processWledAudioFrame({
  config,
  frame,
  previousState,
  timestamp,
}) {
  if (!isWledSyncConfig(config) || !isWledAudioFrame(frame)) {
    throw new Error("Invalid WLED audio frame or configuration.")
  }

  const state = previousState ?? createWledSignalState()
  const deltaMs =
    state.lastProcessedAt === null
      ? 1000 / WLED_AUDIO_SYNC_RATE_HZ
      : Math.max(timestamp - state.lastProcessedAt, 1)
  const rawVolume = applyNoiseFloorAndGain(frame.volume, config)
  const targetBands = frame.bands.map((value) =>
    applyNoiseFloorAndGain(value, config),
  )
  const smoothedVolume = smoothValue(
    state.smoothedVolume,
    rawVolume,
    deltaMs,
  )
  const smoothedBands = targetBands.map((value, index) =>
    smoothValue(state.smoothedBands[index] ?? 0, value, deltaMs),
  )
  const abovePeakThreshold = smoothedVolume >= config.peakThreshold
  const peak = abovePeakThreshold && !state.abovePeakThreshold

  return {
    state: {
      smoothedVolume,
      smoothedBands,
      abovePeakThreshold,
      lastProcessedAt: timestamp,
    },
    packet: createWledAudioSyncPacket({
      rawVolume: rawVolume * 255,
      smoothedVolume: smoothedVolume * 255,
      peak,
      bands: smoothedBands.map((value) => value * 255),
      dominantFrequencyHz: frame.dominantFrequencyHz,
    }),
  }
}

export function createSyntheticWledAudioFrame(elapsedMs) {
  const pulse = (Math.sin((elapsedMs / 1000) * Math.PI * 4) + 1) / 2

  return {
    volume: pulse,
    bands: [
      pulse,
      pulse * 0.82,
      pulse * 0.58,
      pulse * 0.34,
      pulse * 0.2,
      pulse * 0.12,
      pulse * 0.08,
      pulse * 0.05,
      0.03,
      0.03,
      0.02,
      0.02,
      0.01,
      0.01,
      0,
      0,
    ],
    dominantFrequencyHz: 40,
  }
}

export async function loadWledSyncConfig(configPath) {
  try {
    const value = JSON.parse(await readFile(configPath, "utf8"))

    return isWledSyncConfig(value) ? value : { ...defaultWledSyncConfig }
  } catch {
    return { ...defaultWledSyncConfig }
  }
}

export async function saveWledSyncConfig(configPath, config) {
  if (!isWledSyncConfig(config)) {
    throw new Error("Invalid WLED sync configuration.")
  }

  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8")
}

export async function createWledSyncRuntime(options = {}) {
  const now = options.now ?? Date.now
  const createSocket =
    options.createSocket ?? (() => dgram.createSocket("udp4"))
  const setIntervalFn = options.setIntervalFn ?? setInterval
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval
  const configPath =
    options.configPath ??
    path.join(process.cwd(), "data", "wled", "config.json")
  let config = await loadWledSyncConfig(configPath)
  let enabled = false
  let sending = false
  let activeSource = null
  let packetCount = 0
  let lastSendAt = null
  let lastError = null
  let activeStageId = null
  let latestFrame = null
  let lastFrameAt = 0
  let testStartedAt = null
  let socket = null
  let signalState = createWledSignalState()
  let lastSendAttemptAt = Number.NEGATIVE_INFINITY
  let zeroPacketSent = true
  let closed = false

  function getSnapshot() {
    return {
      type: "wled_sync_snapshot",
      config: { ...config },
      enabled,
      sending,
      activeSource,
      packetCount,
      lastSendAt,
      lastError,
      timestamp: now(),
    }
  }

  function getDestination(targetConfig = config) {
    return {
      address:
        targetConfig.mode === "multicast"
          ? WLED_MULTICAST_ADDRESS
          : targetConfig.unicastAddress,
      port: targetConfig.port,
    }
  }

  function getSocket() {
    if (socket) {
      return socket
    }

    const createdSocket = createSocket()

    createdSocket.on?.("error", (error) => {
      lastError = error instanceof Error ? error.message : String(error)
    })
    createdSocket.on?.("close", () => {
      if (socket === createdSocket) {
        socket = null
      }
    })
    socket = createdSocket

    return socket
  }

  function sendPacket(packet, timestamp, targetConfig = config) {
    if (closed) {
      return
    }

    try {
      const udpSocket = getSocket()
      const destination = getDestination(targetConfig)

      if (targetConfig.mode === "multicast") {
        udpSocket.setMulticastTTL?.(2)
      }

      lastSendAttemptAt = timestamp
      udpSocket.send(
        packet,
        destination.port,
        destination.address,
        (error) => {
          if (error) {
            lastError = error.message
            return
          }

          packetCount += 1
          lastSendAt = timestamp
          lastError = null
        },
      )
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  function sendZeroPacket(timestamp, force = false, targetConfig = config) {
    if (zeroPacketSent && !force) {
      return
    }

    signalState = createWledSignalState()
    sendPacket(
      createWledAudioSyncPacket({
        rawVolume: 0,
        smoothedVolume: 0,
        peak: false,
        bands: Array.from({ length: 16 }, () => 0),
        dominantFrequencyHz: 0,
      }),
      timestamp,
      targetConfig,
    )
    zeroPacketSent = true
  }

  function tick() {
    const timestamp = now()

    if (
      activeStageId !== null &&
      timestamp - lastFrameAt > WLED_AUDIO_STALE_MS
    ) {
      activeStageId = null
      latestFrame = null
    }

    if (testStartedAt !== null && timestamp - testStartedAt >= WLED_TEST_DURATION_MS) {
      testStartedAt = null
    }

    if (!enabled) {
      sending = false
      activeSource = null
      sendZeroPacket(timestamp)
      return
    }

    let frame = null

    if (testStartedAt !== null) {
      frame = createSyntheticWledAudioFrame(timestamp - testStartedAt)
      activeSource = "test"
    } else if (
      latestFrame &&
      timestamp - lastFrameAt <= WLED_AUDIO_STALE_MS
    ) {
      frame = latestFrame.wledAudio
      activeSource = latestFrame.source === "song" ? "song" : "microphone"
    }

    if (!frame) {
      sending = false
      activeSource = null
      sendZeroPacket(timestamp)
      return
    }

    if (
      timestamp - lastSendAttemptAt <
      1000 / WLED_AUDIO_SYNC_RATE_HZ
    ) {
      return
    }

    try {
      const result = processWledAudioFrame({
        config,
        frame,
        previousState: signalState,
        timestamp,
      })

      signalState = result.state
      sending = true
      zeroPacketSent = false
      sendPacket(result.packet, timestamp)
    } catch (error) {
      sending = false
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  const interval = setIntervalFn(tick, 1000 / WLED_AUDIO_SYNC_RATE_HZ)

  return {
    getSnapshot,

    receiveFrame(stageId, frame, timestamp = now()) {
      if (!frame?.wledAudio || !isWledAudioFrame(frame.wledAudio)) {
        return false
      }

      const activeStageIsStale =
        activeStageId !== null &&
        timestamp - lastFrameAt > WLED_AUDIO_STALE_MS

      if (
        activeStageId !== null &&
        activeStageId !== stageId &&
        !activeStageIsStale
      ) {
        return false
      }

      activeStageId = stageId
      latestFrame = frame
      lastFrameAt = timestamp
      return true
    },

    removeStage(stageId) {
      if (activeStageId !== stageId) {
        return
      }

      activeStageId = null
      latestFrame = null
      lastFrameAt = 0
      sending = false
      activeSource = null
      sendZeroPacket(now())
    },

    async update(nextConfig, nextEnabled) {
      if (!isWledSyncConfig(nextConfig)) {
        throw new Error("Invalid WLED sync configuration.")
      }

      const previousConfig = config
      const wasEnabled = enabled
      const destinationChanged =
        previousConfig.mode !== nextConfig.mode ||
        previousConfig.unicastAddress !== nextConfig.unicastAddress ||
        previousConfig.port !== nextConfig.port

      if (wasEnabled && (!nextEnabled || destinationChanged)) {
        sendZeroPacket(now(), true, previousConfig)
      }

      config = { ...nextConfig }
      enabled = nextEnabled
      signalState = createWledSignalState()
      zeroPacketSent = !enabled

      if (!enabled) {
        sending = false
        activeSource = null
        testStartedAt = null
      }

      try {
        await saveWledSyncConfig(configPath, config)
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        throw error
      }

      return getSnapshot()
    },

    startTest() {
      if (!enabled) {
        lastError = "Enable WLED sync before starting the test signal."
        return false
      }

      testStartedAt = now()
      signalState = createWledSignalState()
      zeroPacketSent = false
      lastError = null
      return true
    },

    close() {
      if (closed) {
        return
      }

      sendZeroPacket(now(), enabled)
      closed = true
      clearIntervalFn(interval)
      socket?.close?.()
      socket = null
    },
  }
}
