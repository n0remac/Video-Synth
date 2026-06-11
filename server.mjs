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

const clientRoles = new Set(["controller", "color", "stage"])

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
