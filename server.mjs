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

const clientRoles = new Set(["controller", "color", "audio", "stage"])

const defaultAudioCircleSettings = {
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
    settings: { ...defaultAudioCircleSettings },
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
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
      message.userRole === "stage") &&
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
      frame.source === "analyser") &&
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

  function broadcastToStages(message) {
    const payload = JSON.stringify(message)

    for (const [client, connectedUser] of clients) {
      if (client.readyState === 1 && connectedUser.role === "stage") {
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
      broadcastToStages({
        type: "audio_settings_snapshot",
        audioInstanceId: user.audioInstanceId,
        settings: getAudioCircleState(user.audioInstanceId).settings,
        updatedAt: getAudioCircleState(user.audioInstanceId).updatedAt,
      })
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
