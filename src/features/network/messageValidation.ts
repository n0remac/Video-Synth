import type {
  AudioSettingsSnapshotMessage,
  AudioSettingsUpdateMessage,
  ColorControlMessage,
  ClearStageMessage,
  PointerMessage,
  StageAudioFrameMessage,
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

function isAudioCircleSettings(value: unknown) {
  return (
    isRecord(value) &&
    isFiniteNumber(value.sampleStartPercent) &&
    isFiniteNumber(value.sampleEndPercent) &&
    (value.triggerMode === "manual" || value.triggerMode === "adaptive") &&
    isNormalized(value.triggerLevel) &&
    isNormalized(value.adaptiveSensitivity) &&
    isNormalized(value.adaptiveSpeed) &&
    isFiniteNumber(value.gain) &&
    isFiniteNumber(value.cooldownMs) &&
    typeof value.circleColor === "string"
  )
}

function isAudioInstanceId(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

function isAudioRouteSignal(value: unknown) {
  return (
    isRecord(value) &&
    isAudioInstanceId(value.audioInstanceId) &&
    isFiniteNumber(value.sampleStartPercent) &&
    isFiniteNumber(value.sampleEndPercent) &&
    isNormalized(value.level) &&
    isNormalized(value.fastLevel) &&
    isNormalized(value.slowLevel) &&
    isNormalized(value.floor) &&
    isNormalized(value.peak) &&
    isNormalized(value.riseAmount) &&
    isNormalized(value.fallAmount) &&
    isNormalized(value.riseRate) &&
    isNormalized(value.fallRate) &&
    typeof value.triggered === "boolean"
  )
}

function isAudioAnalysisFrame(value: unknown) {
  return (
    isRecord(value) &&
    isNormalized(value.volume) &&
    isNormalized(value.low) &&
    isNormalized(value.mid) &&
    isNormalized(value.high) &&
    isFiniteNumber(value.dominantBin) &&
    Array.isArray(value.spectrum) &&
    value.spectrum.every(isNormalized) &&
    (value.source === undefined ||
      value.source === "audio-worklet" ||
      value.source === "analyser") &&
    (value.sequence === undefined || isFiniteNumber(value.sequence)) &&
    (value.analysisRateHz === undefined ||
      isFiniteNumber(value.analysisRateHz)) &&
    (value.routes === undefined ||
      (Array.isArray(value.routes) && value.routes.every(isAudioRouteSignal))) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isPointerMessage(value: unknown): value is PointerMessage {
  return (
    isRecord(value) &&
    value.type === "pointer" &&
    typeof value.userId === "string" &&
    (value.userRole === undefined ||
      value.userRole === "controller" ||
      value.userRole === "color" ||
      value.userRole === "audio" ||
      value.userRole === "stage") &&
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

export function isStageAudioFrameMessage(
  value: unknown,
): value is StageAudioFrameMessage {
  return (
    isRecord(value) &&
    value.type === "stage_audio_frame" &&
    isAudioAnalysisFrame(value.frame) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isAudioSettingsSnapshotMessage(
  value: unknown,
): value is AudioSettingsSnapshotMessage {
  return (
    isRecord(value) &&
    value.type === "audio_settings_snapshot" &&
    isAudioInstanceId(value.audioInstanceId) &&
    isAudioCircleSettings(value.settings) &&
    isFiniteNumber(value.updatedAt)
  )
}

export function isAudioSettingsUpdateMessage(
  value: unknown,
): value is AudioSettingsUpdateMessage {
  return (
    isRecord(value) &&
    value.type === "audio_settings_update" &&
    typeof value.userId === "string" &&
    isAudioInstanceId(value.audioInstanceId) &&
    isAudioCircleSettings(value.settings) &&
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
        typeof user.color === "string" &&
        (user.role === "controller" || user.role === "audio"),
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
    (value.role === undefined ||
      value.role === "controller" ||
      value.role === "color" ||
      value.role === "audio" ||
      value.role === "stage") &&
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
    isStageAudioFrameMessage(value) ||
    isAudioSettingsSnapshotMessage(value) ||
    isAudioSettingsUpdateMessage(value) ||
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
