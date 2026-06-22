import type {
  AudioSettingsSnapshotMessage,
  AudioInstancesSnapshotMessage,
  AudioSettingsDeleteMessage,
  AudioSettingsUpdateMessage,
  ColorControlMessage,
  ClearStageMessage,
  PointerMessage,
  SongCommandMessage,
  SongTransportUpdateMessage,
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

function isShapeFamily(value: unknown) {
  return (
    value === "prism" ||
    value === "pyramid" ||
    value === "sphere" ||
    value === "polyhedron"
  )
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
}

function isShapeVector3(
  value: unknown,
  ranges: {
    x: { min: number; max: number }
    y: { min: number; max: number }
    z: { min: number; max: number }
  },
) {
  return (
    isRecord(value) &&
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

function isShapeParameters(value: unknown) {
  return (
    isRecord(value) &&
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

function isShapeMotionMapping(value: unknown) {
  return (
    isRecord(value) &&
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

function isShapeMotionMappings(value: unknown) {
  return (
    isRecord(value) &&
    isShapeMotionMapping(value.angleBias) &&
    isShapeMotionMapping(value.bevel) &&
    isShapeMotionMapping(value.depth) &&
    isShapeMotionMapping(value.sideVariation) &&
    isShapeMotionMapping(value.sides) &&
    isShapeMotionMapping(value.size) &&
    isShapeMotionMapping(value.taper) &&
    isShapeMotionMapping(value.twist) &&
    isShapeMotionMapping(value.positionX) &&
    isShapeMotionMapping(value.positionY) &&
    isShapeMotionMapping(value.positionZ) &&
    isShapeMotionMapping(value.rotationX) &&
    isShapeMotionMapping(value.rotationY) &&
    isShapeMotionMapping(value.rotationZ) &&
    isShapeMotionMapping(value.colorHue)
  )
}

function isShapePositionMode(value: unknown) {
  return value === "manual" || value === "spiral"
}

function isShapeSpiralMotionDirection(value: unknown) {
  return value === "clockwise" || value === "counterclockwise"
}

function isShapeSpiralMotionSettings(value: unknown) {
  if (!isRecord(value)) {
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

function isAudioControlledShapeSettings(value: unknown) {
  return (
    isRecord(value) &&
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

function isVisualCvInputSignal(value: unknown) {
  return (
    value === "level" ||
    value === "rise" ||
    value === "fall" ||
    value === "motion"
  )
}

function isVisualCvModulationSource(value: unknown) {
  return (
    isVisualCvInputSignal(value) ||
    value === "smooth" ||
    value === "envelope" ||
    value === "syncSine"
  )
}

function isVisualCvTriggerSource(value: unknown) {
  return value === "range" || value === "envelope" || value === "syncSine"
}

function isVisualCvSmoothConfig(value: unknown) {
  return (
    isRecord(value) &&
    isVisualCvInputSignal(value.input) &&
    isFiniteNumber(value.riseMs) &&
    isFiniteNumber(value.fallMs) &&
    value.riseMs >= 0 &&
    value.riseMs <= 1500 &&
    value.fallMs >= 0 &&
    value.fallMs <= 1500
  )
}

function isVisualCvEnvelopeConfig(value: unknown) {
  return (
    isRecord(value) &&
    isNormalized(value.threshold) &&
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

function isVisualCvSyncSineConfig(value: unknown) {
  return (
    isRecord(value) &&
    isVisualCvInputSignal(value.input) &&
    isNormalized(value.threshold) &&
    isNormalized(value.hysteresis) &&
    isFiniteNumber(value.cooldownMs) &&
    isFiniteNumber(value.lengthMultiple) &&
    (value.phaseMode === "peakOnSpike" ||
      value.phaseMode === "zeroRisingOnSpike" ||
      value.phaseMode === "troughOnSpike" ||
      value.phaseMode === "zeroFallingOnSpike") &&
    (value.syncMode === "soft" || value.syncMode === "hard") &&
    isFiniteNumber(value.historyMs) &&
    isFiniteNumber(value.periodSmoothMs) &&
    isNormalized(value.phaseCorrectionAmount) &&
    value.cooldownMs >= 0 &&
    value.cooldownMs <= 1200 &&
    value.lengthMultiple >= 0.25 &&
    value.lengthMultiple <= 8 &&
    value.historyMs >= 500 &&
    value.historyMs <= 12000 &&
    value.periodSmoothMs >= 0 &&
    value.periodSmoothMs <= 3000
  )
}

function isVisualCvSettings(value: unknown) {
  return (
    isRecord(value) &&
    isVisualCvSmoothConfig(value.smooth) &&
    isVisualCvEnvelopeConfig(value.envelope) &&
    isVisualCvSyncSineConfig(value.syncSine)
  )
}

function isTriggeredCircleVisualCvRouting(value: unknown) {
  return (
    isRecord(value) &&
    isVisualCvTriggerSource(value.triggerSource) &&
    isVisualCvModulationSource(value.sizeSource) &&
    isVisualCvModulationSource(value.growSource) &&
    isVisualCvModulationSource(value.releaseSource)
  )
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
    typeof value.circleColor === "string" &&
    typeof value.circleGrowOnRise === "boolean" &&
    typeof value.circleFadeOnFall === "boolean" &&
    typeof value.circleShrinkOnFall === "boolean" &&
    typeof value.circleLevelControlsSize === "boolean" &&
    isTriggeredCircleVisualCvRouting(value.triggeredCircles) &&
    isVisualCvSettings(value.visualCv) &&
    isAudioControlledShapeSettings(value.centerShape)
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
      value.source === "analyser" ||
      value.source === "song") &&
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
      value.userRole === "stage" ||
      value.userRole === "songs") &&
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

export function isAudioInstancesSnapshotMessage(
  value: unknown,
): value is AudioInstancesSnapshotMessage {
  return (
    isRecord(value) &&
    value.type === "audio_instances_snapshot" &&
    Array.isArray(value.instances) &&
    value.instances.every(
      (instance) =>
        isRecord(instance) &&
        isAudioInstanceId(instance.audioInstanceId) &&
        isFiniteNumber(instance.updatedAt),
    ) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isAudioSettingsDeleteMessage(
  value: unknown,
): value is AudioSettingsDeleteMessage {
  return (
    isRecord(value) &&
    value.type === "audio_settings_delete" &&
    isAudioInstanceId(value.audioInstanceId) &&
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

function isSongId(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

export function isSongCommandMessage(
  value: unknown,
): value is SongCommandMessage {
  if (!isRecord(value) || value.type !== "song_command") {
    return false
  }

  const hasSongId = value.songId !== undefined
  const hasTimeMs = value.timeMs !== undefined

  return (
    (value.command === "load" ||
      value.command === "play" ||
      value.command === "pause" ||
      value.command === "seek" ||
      value.command === "stop") &&
    (value.command === "load" || value.command === "play" ? hasSongId : true) &&
    (!hasSongId || isSongId(value.songId)) &&
    (!hasTimeMs || (isFiniteNumber(value.timeMs) && value.timeMs >= 0)) &&
    (value.command !== "seek" || hasTimeMs) &&
    isFiniteNumber(value.timestamp)
  )
}

export function isSongTransportUpdateMessage(
  value: unknown,
): value is SongTransportUpdateMessage {
  return (
    isRecord(value) &&
    value.type === "song_transport_update" &&
    (value.songId === undefined || isSongId(value.songId)) &&
    (value.state === "idle" ||
      value.state === "loading" ||
      value.state === "ready" ||
      value.state === "playing" ||
      value.state === "paused" ||
      value.state === "ended" ||
      value.state === "error") &&
    isFiniteNumber(value.timeMs) &&
    value.timeMs >= 0 &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs >= 0 &&
    (value.error === undefined || typeof value.error === "string") &&
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
      value.role === "stage" ||
      value.role === "songs") &&
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
    isAudioInstancesSnapshotMessage(value) ||
    isAudioSettingsDeleteMessage(value) ||
    isSongCommandMessage(value) ||
    isSongTransportUpdateMessage(value) ||
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
