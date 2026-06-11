import type {
  ColorControlMessage,
  ClearStageMessage,
  PointerMessage,
  UserJoinedMessage,
  UserLeftMessage,
  UsersSnapshotMessage,
  UserUpdatedMessage,
  VisualizerMessage,
} from "./protocolTypes"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNormalized(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

export function isPointerMessage(value: unknown): value is PointerMessage {
  return (
    isRecord(value) &&
    value.type === "pointer" &&
    typeof value.userId === "string" &&
    isNormalized(value.x) &&
    isNormalized(value.y) &&
    isFiniteNumber(value.vx) &&
    isFiniteNumber(value.vy) &&
    isFiniteNumber(value.speed) &&
    typeof value.down === "boolean" &&
    typeof value.color === "string" &&
    (value.visualMode === "circle" || value.visualMode === "line") &&
    isFiniteNumber(value.trailLineCount) &&
    isFiniteNumber(value.trailLength) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isColorControlMessage(
  value: unknown,
): value is ColorControlMessage {
  return (
    isRecord(value) &&
    value.type === "color_control" &&
    typeof value.userId === "string" &&
    value.source === "touch" &&
    (value.target === "all" ||
      value.target === "background" ||
      value.target === "user") &&
    (value.targetUserId === undefined ||
      typeof value.targetUserId === "string") &&
    (value.target !== "user" || typeof value.targetUserId === "string") &&
    (value.mapping === "hue-brightness" ||
      value.mapping === "saturation-brightness" ||
      value.mapping === "hue-saturation" ||
      value.mapping === "saturation-contrast") &&
    isNormalized(value.x) &&
    isNormalized(value.y) &&
    typeof value.baseColor === "string" &&
    isFiniteNumber(value.amount) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isUsersSnapshotMessage(
  value: unknown,
): value is UsersSnapshotMessage {
  return (
    isRecord(value) &&
    value.type === "users_snapshot" &&
    Array.isArray(value.users) &&
    value.users.every(
      (user) =>
        isRecord(user) &&
        typeof user.userId === "string" &&
        typeof user.color === "string",
    ) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isUserJoinedMessage(value: unknown): value is UserJoinedMessage {
  return (
    isRecord(value) &&
    value.type === "user_joined" &&
    typeof value.userId === "string" &&
    typeof value.color === "string" &&
    isFiniteNumber(value.timestamp)
  )
}

export function isUserLeftMessage(value: unknown): value is UserLeftMessage {
  return (
    isRecord(value) &&
    value.type === "user_left" &&
    typeof value.userId === "string" &&
    isFiniteNumber(value.timestamp)
  )
}

export function isUserUpdatedMessage(
  value: unknown,
): value is UserUpdatedMessage {
  return (
    isRecord(value) &&
    value.type === "user_updated" &&
    typeof value.userId === "string" &&
    (value.color === undefined || typeof value.color === "string") &&
    (value.name === undefined || typeof value.name === "string") &&
    isFiniteNumber(value.timestamp)
  )
}

export function isClearStageMessage(value: unknown): value is ClearStageMessage {
  return (
    isRecord(value) &&
    value.type === "clear_stage" &&
    typeof value.userId === "string" &&
    isFiniteNumber(value.timestamp)
  )
}

export function parseVisualizerMessage(
  payload: string,
): VisualizerMessage | null {
  let value: unknown

  try {
    value = JSON.parse(payload)
  } catch {
    return null
  }

  if (
    isPointerMessage(value) ||
    isColorControlMessage(value) ||
    isUsersSnapshotMessage(value) ||
    isUserJoinedMessage(value) ||
    isUserLeftMessage(value) ||
    isUserUpdatedMessage(value) ||
    isClearStageMessage(value)
  ) {
    return value
  }

  return null
}
