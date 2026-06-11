import type { PatchDefinition } from "@/features/stage/patches/patchTypes"

export type PointerMessage = {
  type: "pointer"
  userId: string
  x: number
  y: number
  vx: number
  vy: number
  speed: number
  down: boolean
  color: string
  visualMode: "circle" | "line"
  trailLineCount: number
  trailLength: number
  timestamp: number
}

export type AudioCircleSettings = {
  sampleStartPercent: number
  sampleEndPercent: number
  triggerMin: number
  triggerMax: number
  gain: number
  cooldownMs: number
  circleColor: string
}

export type AudioAnalysisFrame = {
  volume: number
  low: number
  mid: number
  high: number
  dominantBin: number
  spectrum: number[]
  timestamp: number
}

export type StageAudioFrameMessage = {
  type: "stage_audio_frame"
  frame: AudioAnalysisFrame
  timestamp: number
}

export type AudioSettingsSnapshotMessage = {
  type: "audio_settings_snapshot"
  settings: AudioCircleSettings
  updatedAt: number
}

export type AudioSettingsUpdateMessage = {
  type: "audio_settings_update"
  userId: string
  settings: AudioCircleSettings
  timestamp: number
}

export type VisualizerUserSummary = {
  userId: string
  color: string
}

export type ColorControlSource = "touch"

export type ColorControlTarget = "all" | "background" | "user"

export type ColorControlMappingPreset =
  | "hue-brightness"
  | "saturation-brightness"
  | "hue-saturation"
  | "saturation-contrast"

export type ColorControlMessage = {
  type: "color_control"
  userId: string
  source: ColorControlSource
  target: ColorControlTarget
  targetUserId?: string
  mapping: ColorControlMappingPreset
  x: number
  y: number
  baseColor: string
  amount: number
  timestamp: number
}

export type UsersSnapshotMessage = {
  type: "users_snapshot"
  users: VisualizerUserSummary[]
  timestamp: number
}

export type UserJoinedMessage = {
  type: "user_joined"
  userId: string
  color: string
  timestamp: number
}

export type UserLeftMessage = {
  type: "user_left"
  userId: string
  timestamp: number
}

export type UserUpdatedMessage = {
  type: "user_updated"
  userId: string
  color?: string
  name?: string
  timestamp: number
}

export type ClearStageMessage = {
  type: "clear_stage"
  userId: string
  timestamp: number
}

export type PatchChangedMessage = {
  type: "patch_changed"
  patchId: string
  patch: PatchDefinition
  timestamp: number
}

export type VisualizerMessage =
  | PointerMessage
  | StageAudioFrameMessage
  | AudioSettingsSnapshotMessage
  | AudioSettingsUpdateMessage
  | ColorControlMessage
  | UsersSnapshotMessage
  | UserJoinedMessage
  | UserLeftMessage
  | UserUpdatedMessage
  | PatchChangedMessage
  | ClearStageMessage
