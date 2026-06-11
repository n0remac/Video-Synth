import { createServer } from "node:http"
import next from "next"
import { WebSocketServer } from "ws"

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

let audioCircleSettings = {
  sampleStartPercent: 0,
  sampleEndPercent: 20,
  triggerMin: 0.25,
  triggerMax: 1,
  gain: 1,
  cooldownMs: 250,
  circleColor: "#00d1ff",
}

let audioCircleSettingsUpdatedAt = now()

function now() {
  return Date.now()
}

function createUserId() {
  return `user-${Math.random().toString(36).slice(2, 9)}`
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function isPointerMessage(message) {
  return (
    message &&
    message.type === "pointer" &&
    typeof message.userId === "string" &&
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
    isFiniteNumber(settings.triggerMin) &&
    isFiniteNumber(settings.triggerMax) &&
    isFiniteNumber(settings.gain) &&
    isFiniteNumber(settings.cooldownMs) &&
    typeof settings.circleColor === "string" &&
    settings.sampleStartPercent >= 0 &&
    settings.sampleStartPercent <= 100 &&
    settings.sampleEndPercent >= 0 &&
    settings.sampleEndPercent <= 100 &&
    settings.triggerMin >= 0 &&
    settings.triggerMin <= 1 &&
    settings.triggerMax >= 0 &&
    settings.triggerMax <= 1 &&
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
  return (
    message &&
    message.type === "audio_settings_update" &&
    typeof message.userId === "string" &&
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

  function getControllerUsers() {
    return Array.from(clients.values())
      .filter((client) => client.role === "controller")
      .map((client) => ({
        userId: client.id,
        color: client.color,
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

  wss.on("connection", (socket, request) => {
    const role = getRole(request)
    const color = userColors[clients.size % userColors.length]
    const user = {
      id: createUserId(),
      role,
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
        users: getControllerUsers(),
        timestamp: now(),
      }),
    )

    socket.send(
      JSON.stringify({
        type: "audio_settings_snapshot",
        settings: audioCircleSettings,
        updatedAt: audioCircleSettingsUpdatedAt,
      }),
    )

    if (role === "controller") {
      broadcast({
        type: "user_joined",
        userId: user.id,
        color: user.color,
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
        broadcast({ ...message, userId: user.id })
        return
      }

      if (role === "stage" && isStageAudioFrameMessage(message)) {
        broadcast({ ...message, timestamp: now() })
        return
      }

      if (role === "audio" && isAudioSettingsUpdateMessage(message)) {
        audioCircleSettings = message.settings
        audioCircleSettingsUpdatedAt = now()
        broadcast({
          type: "audio_settings_update",
          userId: user.id,
          settings: audioCircleSettings,
          timestamp: audioCircleSettingsUpdatedAt,
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
      if (role === "controller") {
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
