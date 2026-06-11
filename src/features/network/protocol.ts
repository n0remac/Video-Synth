import type { ColorControlMessage, PointerMessage } from "./protocolTypes"

export function createPointerMessage(input: PointerMessage): PointerMessage {
  return {
    type: "pointer",
    userId: input.userId,
    x: input.x,
    y: input.y,
    vx: input.vx,
    vy: input.vy,
    speed: input.speed,
    down: input.down,
    color: input.color,
    visualMode: input.visualMode,
    trailLineCount: input.trailLineCount,
    trailLength: input.trailLength,
    timestamp: input.timestamp,
  }
}

export function createColorControlMessage(
  input: ColorControlMessage,
): ColorControlMessage {
  return {
    type: "color_control",
    userId: input.userId,
    source: input.source,
    target: input.target,
    targetUserId: input.targetUserId,
    mapping: input.mapping,
    x: input.x,
    y: input.y,
    baseColor: input.baseColor,
    amount: input.amount,
    timestamp: input.timestamp,
  }
}

export function getVisualizerSocketUrl(role?: "controller" | "color" | "stage") {
  if (typeof window === "undefined") {
    return ""
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${window.location.host}/ws`)

  if (role) {
    url.searchParams.set("role", role)
  }

  return url.toString()
}
