import { createServer } from "node:http"
import next from "next"
import { WebSocketServer } from "ws"
import { normalizeAudioInstanceId } from "./src/server/audioInstanceIds.mjs"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME ?? "0.0.0.0"
const port = Number.parseInt(process.env.PORT ?? "3000", 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const userColors = [
  "#ff2d75",
  "#00d1ff",
  "#ffe156",
  "#3cff9e",
  "#b967ff",
  "#ff8f3c",
  "#36f1cd",
  "#f7f7ff",
]

const clientRoles = new Set(["controller", "color", "audio", "stage", "songs"])

const shapeParameterNames = [
  "angleBias",
  "bevel",
  "depth",
  "sideVariation",
  "sides",
  "size",
  "taper",
  "twist",
]
const shapeTransformControlNames = [
  "positionX",
  "positionY",
  "positionZ",
  "rotationX",
  "rotationY",
  "rotationZ",
  "colorHue",
]
const centerShapeControlNames = [
  ...shapeParameterNames,
  ...shapeTransformControlNames,
]

const defaultShapeMotionMapping = {
  enabled: false,
  source: "rise-fall",
  amount: 0,
  invert: false,
  mode: "oscillate",
  resetMs: 2000,
}

const defaultShapeSpiralMotionSettings = {
  enabled: false,
  visualize: true,
  startRadius: 1,
  radiusSource: "smooth",
  radiusCvAmount: 0.25,
  moveSource: "syncSine",
  moveRate: 1,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  pathDurationMs: 4000,
  pathCount: 8,
  spawnSource: "syncSine",
  spawnRateHz: 0.5,
  maxActiveShapes: 128,
  edgePadding: 0.06,
  direction: "clockwise",
  startPhaseDegrees: 0,
}

function createDefaultShapeMotionMappings() {
  return Object.fromEntries(
    centerShapeControlNames.map((parameterName) => [
      parameterName,
      { ...defaultShapeMotionMapping },
    ]),
  )
}

function createDefaultCenterShapeSettings() {
  return {
    enabled: false,
    mode: "2d",
    family: "prism",
    color: "#00d1ff",
    parameters: {
      angleBias: 0,
      bevel: 0.04,
      depth: 1.1,
      sideVariation: 0,
      sides: 6,
      size: 1.7,
      taper: 1,
      twist: 0,
    },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    positionMode: "manual",
    spiralMotion: { ...defaultShapeSpiralMotionSettings },
    motionMappings: createDefaultShapeMotionMappings(),
  }
}

function createDefaultVisualCvSettings() {
  return {
    smooth: {
      input: "level",
      riseMs: 180,
      fallMs: 320,
    },
    envelope: {
      threshold: 0.35,
      attackMs: 80,
      decayMs: 420,
      cooldownMs: 180,
    },
    syncSine: {
      input: "motion",
      threshold: 0.35,
      hysteresis: 0.08,
      cooldownMs: 160,
      lengthMultiple: 2,
      phaseMode: "peakOnSpike",
      syncMode: "soft",
      historyMs: 6000,
      periodSmoothMs: 300,
      phaseCorrectionAmount: 0.15,
    },
  }
}

function createDefaultAudioCircleSettings() {
  return {
    sampleStartPercent: 0,
    sampleEndPercent: 20,
    triggerMode: "manual",
    triggerLevel: 0.25,
    adaptiveSensitivity: 0.6,
    adaptiveSpeed: 0.08,
    gain: 1,
    cooldownMs: 250,
    circleColor: "#00d1ff",
    circleGrowOnRise: false,
    circleFadeOnFall: false,
    circleShrinkOnFall: false,
    circleLevelControlsSize: false,
    triggeredCircles: {
      triggerSource: "range",
      sizeSource: "level",
      growSource: "rise",
      releaseSource: "fall",
    },
    visualCv: createDefaultVisualCvSettings(),
    centerShape: createDefaultCenterShapeSettings(),
  }
}

const audioCircleSettingsByInstance = new Map()

function now() {
  return Date.now()
}

function createUserId() {
  return `user-${Math.random().toString(36).slice(2, 9)}`
}

function getAudioCircleState(audioInstanceId) {
  const existingState = audioCircleSettingsByInstance.get(audioInstanceId)

  if (existingState) {
    return existingState
  }

  const state = {
    settings: createDefaultAudioCircleSettings(),
    updatedAt: now(),
  }

  audioCircleSettingsByInstance.set(audioInstanceId, state)

  return state
}

function setAudioCircleSettings(audioInstanceId, settings) {
  const state = {
    settings,
    updatedAt: now(),
  }

  audioCircleSettingsByInstance.set(audioInstanceId, state)

  return state
}

function deleteAudioCircleSettings(audioInstanceId) {
  audioCircleSettingsByInstance.delete(audioInstanceId)
}

function getAudioInstanceSummaries() {
  return Array.from(audioCircleSettingsByInstance.entries())
    .map(([audioInstanceId, state]) => ({
      audioInstanceId,
      updatedAt: state.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isShapeFamily(value) {
  return (
    value === "prism" ||
    value === "pyramid" ||
    value === "sphere" ||
    value === "polyhedron"
  )
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
}

function isShapeVector3(value, ranges) {
  return (
    value &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    value.x >= ranges.x.min &&
    value.x <= ranges.x.max &&
    value.y >= ranges.y.min &&
    value.y <= ranges.y.max &&
    value.z >= ranges.z.min &&
    value.z <= ranges.z.max
  )
}

function isShapeParameters(value) {
  return (
    value &&
    isFiniteNumber(value.angleBias) &&
    isFiniteNumber(value.bevel) &&
    isFiniteNumber(value.depth) &&
    isFiniteNumber(value.sideVariation) &&
    isFiniteNumber(value.sides) &&
    isFiniteNumber(value.size) &&
    isFiniteNumber(value.taper) &&
    isFiniteNumber(value.twist) &&
    value.angleBias >= -1 &&
    value.angleBias <= 1 &&
    value.bevel >= 0 &&
    value.bevel <= 0.25 &&
    value.depth >= 0.2 &&
    value.depth <= 3 &&
    value.sideVariation >= 0 &&
    value.sideVariation <= 1 &&
    value.sides >= 3 &&
    value.sides <= 24 &&
    value.size >= 0.7 &&
    value.size <= 2.6 &&
    value.taper >= 0.2 &&
    value.taper <= 1.8 &&
    value.twist >= -180 &&
    value.twist <= 180
  )
}

function isShapeMotionMapping(value) {
  return (
    value &&
    typeof value.enabled === "boolean" &&
    (value.source === "level" ||
      value.source === "rise-fall" ||
      value.source === "motion" ||
      value.source === "smooth" ||
      value.source === "envelope" ||
      value.source === "syncSine") &&
    isFiniteNumber(value.amount) &&
    typeof value.invert === "boolean" &&
    (value.mode === "oscillate" || value.mode === "continuous") &&
    isFiniteNumber(value.resetMs) &&
    value.amount >= 0 &&
    value.amount <= 360 &&
    value.resetMs >= 250
  )
}

function isShapeMotionMappings(value) {
  return (
    value &&
    centerShapeControlNames.every((parameterName) =>
      isShapeMotionMapping(value[parameterName]),
    )
  )
}

function isShapePositionMode(value) {
  return value === "manual" || value === "spiral"
}

function isShapeSpiralMotionDirection(value) {
  return value === "clockwise" || value === "counterclockwise"
}

function isShapeSpiralMotionSettings(value) {
  if (!value) {
    return false
  }

  const pathCount =
    value.pathCount === undefined
      ? 1
      : isFiniteNumber(value.pathCount) && Number.isInteger(value.pathCount)
        ? value.pathCount
        : NaN
  const hasValidPathDuration =
    (isFiniteNumber(value.pathDurationMs) && value.pathDurationMs >= 250) ||
    (value.pathDurationMs === undefined &&
      isFiniteNumber(value.resetMs) &&
      value.resetMs >= 250)

  return (
    typeof value.enabled === "boolean" &&
    typeof value.visualize === "boolean" &&
    isFiniteNumber(value.startRadius) &&
    value.startRadius >= 0 &&
    value.startRadius <= 20 &&
    isVisualCvModulationSource(value.radiusSource) &&
    isFiniteNumber(value.radiusCvAmount) &&
    value.radiusCvAmount >= 0 &&
    value.radiusCvAmount <= 20 &&
    (value.moveSource === undefined ||
      isVisualCvModulationSource(value.moveSource)) &&
    (value.moveRate === undefined ||
      (isFiniteNumber(value.moveRate) &&
        value.moveRate >= 0 &&
        value.moveRate <= 20)) &&
    isFiniteNumber(value.degreesPerPulse) &&
    value.degreesPerPulse >= 0 &&
    value.degreesPerPulse <= 3600 &&
    isFiniteNumber(value.depthPerPulse) &&
    value.depthPerPulse >= 0 &&
    value.depthPerPulse <= 100 &&
    hasValidPathDuration &&
    pathCount >= 1 &&
    pathCount <= 64 &&
    (value.spawnSource === undefined ||
      isVisualCvModulationSource(value.spawnSource)) &&
    (value.spawnRateHz === undefined ||
      (isFiniteNumber(value.spawnRateHz) &&
        value.spawnRateHz >= 0 &&
        value.spawnRateHz <= 20)) &&
    (value.maxActiveShapes === undefined ||
      (isFiniteNumber(value.maxActiveShapes) &&
        Number.isInteger(value.maxActiveShapes) &&
        value.maxActiveShapes >= pathCount &&
        value.maxActiveShapes <= 512)) &&
    (value.edgePadding === undefined ||
      (isFiniteNumber(value.edgePadding) &&
        value.edgePadding >= 0 &&
        value.edgePadding <= 0.5)) &&
    isShapeSpiralMotionDirection(value.direction) &&
    isFiniteNumber(value.startPhaseDegrees) &&
    value.startPhaseDegrees >= -3600 &&
    value.startPhaseDegrees <= 3600
  )
}

function isAudioControlledShapeSettings(value) {
  return (
    value &&
    typeof value.enabled === "boolean" &&
    (value.mode === "2d" || value.mode === "3d") &&
    isShapeFamily(value.family) &&
    isHexColor(value.color) &&
    isShapeParameters(value.parameters) &&
    isShapeVector3(value.position, {
      x: { min: -1.5, max: 1.5 },
      y: { min: -1, max: 1 },
      z: { min: -2, max: 2 },
    }) &&
    isShapeVector3(value.rotation, {
      x: { min: -180, max: 180 },
      y: { min: -180, max: 180 },
      z: { min: -180, max: 180 },
    }) &&
    isShapePositionMode(value.positionMode) &&
    isShapeSpiralMotionSettings(value.spiralMotion) &&
    isShapeMotionMappings(value.motionMappings)
  )
}

function isPointerMessage(message) {
  return (
    message &&
    message.type === "pointer" &&
    typeof message.userId === "string" &&
    (message.userRole === undefined ||
      message.userRole === "controller" ||
      message.userRole === "color" ||
      message.userRole === "audio" ||
      message.userRole === "stage" ||
      message.userRole === "songs") &&
    isFiniteNumber(message.x) &&
    isFiniteNumber(message.y) &&
    isFiniteNumber(message.vx) &&
    isFiniteNumber(message.vy) &&
    isFiniteNumber(message.speed) &&
    typeof message.down === "boolean" &&
    typeof message.color === "string" &&
    (message.visualMode === "circle" || message.visualMode === "line") &&
    isFiniteNumber(message.trailLineCount) &&
    isFiniteNumber(message.trailLength) &&
    isFiniteNumber(message.timestamp) &&
    message.x >= 0 &&
    message.x <= 1 &&
    message.y >= 0 &&
    message.y <= 1
  )
}

function isVisualCvInputSignal(value) {
  return (
    value === "level" ||
    value === "rise" ||
    value === "fall" ||
    value === "motion"
  )
}

function isVisualCvModulationSource(value) {
  return (
    isVisualCvInputSignal(value) ||
    value === "smooth" ||
    value === "envelope" ||
    value === "syncSine"
  )
}

function isVisualCvTriggerSource(value) {
  return value === "range" || value === "envelope" || value === "syncSine"
}

function isVisualCvSmoothConfig(value) {
  return (
    value &&
    isVisualCvInputSignal(value.input) &&
    isFiniteNumber(value.riseMs) &&
    isFiniteNumber(value.fallMs) &&
    value.riseMs >= 0 &&
    value.riseMs <= 1500 &&
    value.fallMs >= 0 &&
    value.fallMs <= 1500
  )
}

function isVisualCvEnvelopeConfig(value) {
  return (
    value &&
    isFiniteNumber(value.threshold) &&
    value.threshold >= 0 &&
    value.threshold <= 1 &&
    isFiniteNumber(value.attackMs) &&
    isFiniteNumber(value.decayMs) &&
    isFiniteNumber(value.cooldownMs) &&
    value.attackMs >= 0 &&
    value.attackMs <= 1500 &&
    value.decayMs >= 0 &&
    value.decayMs <= 3000 &&
    value.cooldownMs >= 0 &&
    value.cooldownMs <= 1200
  )
}

function isVisualCvSyncSineConfig(value) {
  return (
    value &&
    isVisualCvInputSignal(value.input) &&
    isFiniteNumber(value.threshold) &&
    value.threshold >= 0 &&
    value.threshold <= 1 &&
    isFiniteNumber(value.hysteresis) &&
    value.hysteresis >= 0 &&
    value.hysteresis <= 1 &&
    isFiniteNumber(value.cooldownMs) &&
    value.cooldownMs >= 0 &&
    value.cooldownMs <= 1200 &&
    isFiniteNumber(value.lengthMultiple) &&
    value.lengthMultiple >= 0.25 &&
    value.lengthMultiple <= 8 &&
    (value.phaseMode === "peakOnSpike" ||
      value.phaseMode === "zeroRisingOnSpike" ||
      value.phaseMode === "troughOnSpike" ||
      value.phaseMode === "zeroFallingOnSpike") &&
    (value.syncMode === "soft" || value.syncMode === "hard") &&
    isFiniteNumber(value.historyMs) &&
    value.historyMs >= 500 &&
    value.historyMs <= 12000 &&
    isFiniteNumber(value.periodSmoothMs) &&
    value.periodSmoothMs >= 0 &&
    value.periodSmoothMs <= 3000 &&
    isFiniteNumber(value.phaseCorrectionAmount) &&
    value.phaseCorrectionAmount >= 0 &&
    value.phaseCorrectionAmount <= 1
  )
}

function isVisualCvSettings(value) {
  return (
    value &&
    isVisualCvSmoothConfig(value.smooth) &&
    isVisualCvEnvelopeConfig(value.envelope) &&
    isVisualCvSyncSineConfig(value.syncSine)
  )
}

function isTriggeredCircleVisualCvRouting(value) {
  return (
    value &&
    isVisualCvTriggerSource(value.triggerSource) &&
    isVisualCvModulationSource(value.sizeSource) &&
    isVisualCvModulationSource(value.growSource) &&
    isVisualCvModulationSource(value.releaseSource)
  )
}

function isAudioCircleSettings(settings) {
  return (
    settings &&
    isFiniteNumber(settings.sampleStartPercent) &&
    isFiniteNumber(settings.sampleEndPercent) &&
    (settings.triggerMode === "manual" || settings.triggerMode === "adaptive") &&
    isFiniteNumber(settings.triggerLevel) &&
    isFiniteNumber(settings.adaptiveSensitivity) &&
    isFiniteNumber(settings.adaptiveSpeed) &&
    isFiniteNumber(settings.gain) &&
    isFiniteNumber(settings.cooldownMs) &&
    typeof settings.circleColor === "string" &&
    typeof settings.circleGrowOnRise === "boolean" &&
    typeof settings.circleFadeOnFall === "boolean" &&
    typeof settings.circleShrinkOnFall === "boolean" &&
    typeof settings.circleLevelControlsSize === "boolean" &&
    isTriggeredCircleVisualCvRouting(settings.triggeredCircles) &&
    isVisualCvSettings(settings.visualCv) &&
    isAudioControlledShapeSettings(settings.centerShape) &&
    settings.sampleStartPercent >= 0 &&
    settings.sampleStartPercent <= 100 &&
    settings.sampleEndPercent >= 0 &&
    settings.sampleEndPercent <= 100 &&
    settings.triggerLevel >= 0 &&
    settings.triggerLevel <= 1 &&
    settings.adaptiveSensitivity >= 0 &&
    settings.adaptiveSensitivity <= 1 &&
    settings.adaptiveSpeed >= 0 &&
    settings.adaptiveSpeed <= 1 &&
    settings.gain >= 0.1 &&
    settings.gain <= 6 &&
    settings.cooldownMs >= 50 &&
    settings.cooldownMs <= 1200
  )
}

function isNormalized(value) {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function isAudioAnalysisFrame(frame) {
  return (
    frame &&
    isNormalized(frame.volume) &&
    isNormalized(frame.low) &&
    isNormalized(frame.mid) &&
    isNormalized(frame.high) &&
    isFiniteNumber(frame.dominantBin) &&
    Array.isArray(frame.spectrum) &&
    frame.spectrum.every(isNormalized) &&
    (frame.source === undefined ||
      frame.source === "audio-worklet" ||
      frame.source === "analyser" ||
      frame.source === "song") &&
    (frame.sequence === undefined || isFiniteNumber(frame.sequence)) &&
    (frame.analysisRateHz === undefined ||
      isFiniteNumber(frame.analysisRateHz)) &&
    (frame.routes === undefined ||
      (Array.isArray(frame.routes) &&
        frame.routes.every(
          (route) =>
            route &&
            normalizeAudioInstanceId(route.audioInstanceId) ===
              route.audioInstanceId &&
            isFiniteNumber(route.sampleStartPercent) &&
            isFiniteNumber(route.sampleEndPercent) &&
            isNormalized(route.level) &&
            isNormalized(route.fastLevel) &&
            isNormalized(route.slowLevel) &&
            isNormalized(route.floor) &&
            isNormalized(route.peak) &&
            isNormalized(route.riseAmount) &&
            isNormalized(route.fallAmount) &&
            isNormalized(route.riseRate) &&
            isNormalized(route.fallRate) &&
            typeof route.triggered === "boolean",
        ))) &&
    isFiniteNumber(frame.timestamp)
  )
}

function isStageAudioFrameMessage(message) {
  return (
    message &&
    message.type === "stage_audio_frame" &&
    isAudioAnalysisFrame(message.frame) &&
    isFiniteNumber(message.timestamp)
  )
}

function isAudioSettingsUpdateMessage(message) {
  const hasAudioInstanceId = message?.audioInstanceId !== undefined

  return (
    message &&
    message.type === "audio_settings_update" &&
    typeof message.userId === "string" &&
    (!hasAudioInstanceId ||
      normalizeAudioInstanceId(message.audioInstanceId) === message.audioInstanceId) &&
    isAudioCircleSettings(message.settings) &&
    isFiniteNumber(message.timestamp)
  )
}

function isAudioSettingsDeleteMessage(message) {
  return (
    message &&
    message.type === "audio_settings_delete" &&
    normalizeAudioInstanceId(message.audioInstanceId) === message.audioInstanceId &&
    isFiniteNumber(message.timestamp)
  )
}

function isColorControlMessage(message) {
  return (
    message &&
    message.type === "color_control" &&
    typeof message.userId === "string" &&
    message.source === "touch" &&
    (message.target === "all" ||
      message.target === "background" ||
      message.target === "user") &&
    (message.targetUserId === undefined ||
      typeof message.targetUserId === "string") &&
    (message.target !== "user" || typeof message.targetUserId === "string") &&
    (message.mapping === "hue-brightness" ||
      message.mapping === "saturation-brightness" ||
      message.mapping === "hue-saturation" ||
      message.mapping === "saturation-contrast") &&
    isFiniteNumber(message.x) &&
    isFiniteNumber(message.y) &&
    typeof message.baseColor === "string" &&
    isFiniteNumber(message.amount) &&
    isFiniteNumber(message.timestamp) &&
    message.x >= 0 &&
    message.x <= 1 &&
    message.y >= 0 &&
    message.y <= 1
  )
}

function isClearStageMessage(message) {
  return (
    message &&
    message.type === "clear_stage" &&
    typeof message.userId === "string" &&
    isFiniteNumber(message.timestamp)
  )
}

function isSongId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

function isSongCommandMessage(message) {
  if (!message || message.type !== "song_command") {
    return false
  }

  const hasSongId = message.songId !== undefined
  const hasTimeMs = message.timeMs !== undefined

  return (
    (message.command === "load" ||
      message.command === "play" ||
      message.command === "pause" ||
      message.command === "seek" ||
      message.command === "stop") &&
    (message.command === "load" || message.command === "play" ? hasSongId : true) &&
    (!hasSongId || isSongId(message.songId)) &&
    (!hasTimeMs || (isFiniteNumber(message.timeMs) && message.timeMs >= 0)) &&
    (message.command !== "seek" || hasTimeMs) &&
    isFiniteNumber(message.timestamp)
  )
}

function isSongTransportUpdateMessage(message) {
  return (
    message &&
    message.type === "song_transport_update" &&
    (message.songId === undefined || isSongId(message.songId)) &&
    (message.state === "idle" ||
      message.state === "loading" ||
      message.state === "ready" ||
      message.state === "playing" ||
      message.state === "paused" ||
      message.state === "ended" ||
      message.state === "error") &&
    isFiniteNumber(message.timeMs) &&
    message.timeMs >= 0 &&
    isFiniteNumber(message.durationMs) &&
    message.durationMs >= 0 &&
    (message.error === undefined || typeof message.error === "string") &&
    isFiniteNumber(message.timestamp)
  )
}

app.prepare().then(() => {
  const server = createServer((request, response) => {
    handle(request, response)
  })

  const wss = new WebSocketServer({ server, path: "/ws" })
  const clients = new Map()

  function getRole(request) {
    const url = new URL(request.url ?? "/ws", `http://${request.headers.host}`)
    const role = url.searchParams.get("role")

    return clientRoles.has(role) ? role : "controller"
  }

  function getAudioInstanceId(request) {
    const url = new URL(request.url ?? "/ws", `http://${request.headers.host}`)

    return normalizeAudioInstanceId(url.searchParams.get("audioInstanceId"))
  }

  function getTargetableUsers() {
    return Array.from(clients.values())
      .filter((client) => client.role === "controller" || client.role === "audio")
      .map((client) => ({
        userId: client.id,
        color: client.color,
        role: client.role,
      }))
  }

  function broadcast(message) {
    const payload = JSON.stringify(message)

    for (const client of clients.keys()) {
      if (client.readyState === 1) {
        client.send(payload)
      }
    }
  }

  function broadcastToAudioInstance(audioInstanceId, message) {
    const payload = JSON.stringify(message)

    for (const [client, connectedUser] of clients) {
      if (
        client.readyState === 1 &&
        connectedUser.role === "audio" &&
        connectedUser.audioInstanceId === audioInstanceId
      ) {
        client.send(payload)
      }
    }
  }

  function broadcastToAudioClients(message) {
    const payload = JSON.stringify(message)

    for (const [client, connectedUser] of clients) {
      if (client.readyState === 1 && connectedUser.role === "audio") {
        client.send(payload)
      }
    }
  }

  function broadcastToStages(message) {
    const payload = JSON.stringify(message)

    for (const [client, connectedUser] of clients) {
      if (client.readyState === 1 && connectedUser.role === "stage") {
        client.send(payload)
      }
    }
  }

  function broadcastToSongClients(message) {
    const payload = JSON.stringify(message)

    for (const [client, connectedUser] of clients) {
      if (client.readyState === 1 && connectedUser.role === "songs") {
        client.send(payload)
      }
    }
  }

  function sendAudioSettingsSnapshot(socket, audioInstanceId) {
    const audioCircleState = getAudioCircleState(audioInstanceId)

    socket.send(
      JSON.stringify({
        type: "audio_settings_snapshot",
        audioInstanceId,
        settings: audioCircleState.settings,
        updatedAt: audioCircleState.updatedAt,
      }),
    )
  }

  function sendAudioInstancesSnapshot(socket) {
    socket.send(
      JSON.stringify({
        type: "audio_instances_snapshot",
        instances: getAudioInstanceSummaries(),
        timestamp: now(),
      }),
    )
  }

  function broadcastAudioInstancesSnapshot() {
    broadcastToAudioClients({
      type: "audio_instances_snapshot",
      instances: getAudioInstanceSummaries(),
      timestamp: now(),
    })
  }

  wss.on("connection", (socket, request) => {
    const role = getRole(request)
    const audioInstanceId = role === "audio" ? getAudioInstanceId(request) : undefined
    const color = userColors[clients.size % userColors.length]
    const user = {
      id: createUserId(),
      role,
      audioInstanceId,
      color,
      connectedAt: now(),
      lastSeenAt: now(),
    }

    clients.set(socket, user)

    socket.send(
      JSON.stringify({
        type: "user_joined",
        userId: user.id,
        color: user.color,
        timestamp: now(),
      }),
    )

    socket.send(
      JSON.stringify({
        type: "users_snapshot",
        users: getTargetableUsers(),
        timestamp: now(),
      }),
    )

    if (role === "audio") {
      sendAudioSettingsSnapshot(socket, user.audioInstanceId)
      sendAudioInstancesSnapshot(socket)
      broadcastToStages({
        type: "audio_settings_snapshot",
        audioInstanceId: user.audioInstanceId,
        settings: getAudioCircleState(user.audioInstanceId).settings,
        updatedAt: getAudioCircleState(user.audioInstanceId).updatedAt,
      })
      broadcastAudioInstancesSnapshot()
    }

    if (role === "stage") {
      for (const audioInstanceId of audioCircleSettingsByInstance.keys()) {
        sendAudioSettingsSnapshot(socket, audioInstanceId)
      }
    }

    if (role === "controller" || role === "audio") {
      broadcast({
        type: "user_joined",
        userId: user.id,
        color: user.color,
        role: user.role,
        timestamp: now(),
      })
    }

    socket.on("message", (data) => {
      let message

      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }

      user.lastSeenAt = now()

      if (isPointerMessage(message)) {
        broadcast({ ...message, userId: user.id, userRole: user.role })
        return
      }

      if (role === "stage" && isStageAudioFrameMessage(message)) {
        broadcast({ ...message, timestamp: now() })
        return
      }

      if (role === "songs" && isSongCommandMessage(message)) {
        broadcastToStages({ ...message, timestamp: now() })
        return
      }

      if (role === "stage" && isSongTransportUpdateMessage(message)) {
        broadcastToSongClients({ ...message, timestamp: now() })
        return
      }

      if (
        role === "audio" &&
        isAudioSettingsUpdateMessage(message) &&
        normalizeAudioInstanceId(message.audioInstanceId) === user.audioInstanceId
      ) {
        const audioCircleState = setAudioCircleSettings(
          user.audioInstanceId,
          message.settings,
        )

        broadcastToAudioInstance(user.audioInstanceId, {
          type: "audio_settings_update",
          userId: user.id,
          audioInstanceId: user.audioInstanceId,
          settings: audioCircleState.settings,
          timestamp: audioCircleState.updatedAt,
        })
        broadcastToStages({
          type: "audio_settings_update",
          userId: user.id,
          audioInstanceId: user.audioInstanceId,
          settings: audioCircleState.settings,
          timestamp: audioCircleState.updatedAt,
        })
        broadcastAudioInstancesSnapshot()
        return
      }

      if (role === "audio" && isAudioSettingsDeleteMessage(message)) {
        deleteAudioCircleSettings(message.audioInstanceId)

        const deleteMessage = {
          type: "audio_settings_delete",
          audioInstanceId: message.audioInstanceId,
          timestamp: now(),
        }

        broadcastToAudioClients(deleteMessage)
        broadcastToStages(deleteMessage)
        broadcastAudioInstancesSnapshot()
        return
      }

      if (isColorControlMessage(message)) {
        broadcast({ ...message, userId: user.id, timestamp: now() })
        return
      }

      if (isClearStageMessage(message)) {
        broadcast({ ...message, userId: user.id, timestamp: now() })
      }
    })

    socket.on("close", () => {
      clients.delete(socket)
      if (role === "controller" || role === "audio") {
        broadcast({
          type: "user_left",
          userId: user.id,
          timestamp: now(),
        })
      }
    })
  })

  server.listen(port, hostname, () => {
    console.log(`Signal Paint listening at http://${hostname}:${port}`)
  })
})
