import type { PatchDefinition } from "@/features/stage/patches/patchTypes"
import type { AudioControlledShapeSettings } from "@/features/shapeGenerator/shapeGeneratorTypes"
import type {
  TriggeredCircleVisualCvRouting,
  VisualCvSettings,
} from "@/features/visualCv/visualCvTypes"

export type VisualizerClientRole =
  | "controller"
  | "color"
  | "audio"
  | "audio-patches"
  | "stage"
  | "songs"
  | "wled"

export type PointerMessage = {
  type: "pointer"
  userId: string
  userRole?: VisualizerClientRole
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

export type AudioTriggerMode = "manual" | "adaptive"

export type AudioCircleSettings = {
  sampleStartPercent: number
  sampleEndPercent: number
  triggerMode: AudioTriggerMode
  triggerLevel: number
  adaptiveSensitivity: number
  adaptiveSpeed: number
  gain: number
  cooldownMs: number
  circleColor: string
  circleGrowOnRise: boolean
  circleFadeOnFall: boolean
  circleShrinkOnFall: boolean
  circleLevelControlsSize: boolean
  triggeredCircles: TriggeredCircleVisualCvRouting
  visualCv: VisualCvSettings
  centerShape: AudioControlledShapeSettings
}

export type AudioRouteSignal = {
  audioInstanceId: string
  sampleStartPercent: number
  sampleEndPercent: number
  level: number
  fastLevel: number
  slowLevel: number
  floor: number
  peak: number
  riseAmount: number
  fallAmount: number
  riseRate: number
  fallRate: number
  triggered: boolean
}

export type WledAudioFrame = {
  volume: number
  bands: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  dominantFrequencyHz: number
}

export type AudioAnalysisFrame = {
  volume: number
  low: number
  mid: number
  high: number
  dominantBin: number
  spectrum: number[]
  source?: "audio-worklet" | "analyser" | "song"
  sequence?: number
  analysisRateHz?: number
  routes?: AudioRouteSignal[]
  wledAudio?: WledAudioFrame
  timestamp: number
}

export type StageAudioFrameMessage = {
  type: "stage_audio_frame"
  frame: AudioAnalysisFrame
  timestamp: number
}

export type WledSyncMode = "multicast" | "unicast"

export type WledSyncConfig = {
  mode: WledSyncMode
  unicastAddress: string
  port: number
  gain: number
  noiseFloor: number
  peakThreshold: number
}

export type WledSyncUpdateMessage = {
  type: "wled_sync_update"
  config: WledSyncConfig
  enabled: boolean
  timestamp: number
}

export type WledSyncTestMessage = {
  type: "wled_sync_test"
  timestamp: number
}

export type WledSyncSnapshotMessage = {
  type: "wled_sync_snapshot"
  config: WledSyncConfig
  enabled: boolean
  sending: boolean
  activeSource: "microphone" | "song" | "test" | null
  packetCount: number
  lastSendAt: number | null
  lastError: string | null
  timestamp: number
}

export type AudioSettingsSnapshotMessage = {
  type: "audio_settings_snapshot"
  audioInstanceId: string
  settings: AudioCircleSettings
  updatedAt: number
}

export type AudioSettingsUpdateMessage = {
  type: "audio_settings_update"
  userId: string
  audioInstanceId: string
  settings: AudioCircleSettings
  timestamp: number
}

export type AudioInstanceSummary = {
  audioInstanceId: string
  updatedAt: number
}

export type AudioInstancesSnapshotMessage = {
  type: "audio_instances_snapshot"
  instances: AudioInstanceSummary[]
  timestamp: number
}

export type AudioSettingsDeleteMessage = {
  type: "audio_settings_delete"
  audioInstanceId: string
  timestamp: number
}

export type SongCommandName = "load" | "play" | "pause" | "seek" | "stop"

export type SongCommandMessage = {
  type: "song_command"
  command: SongCommandName
  songId?: string
  timeMs?: number
  timestamp: number
}

export type SongTransportState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error"

export type SongTransportUpdateMessage = {
  type: "song_transport_update"
  songId?: string
  state: SongTransportState
  timeMs: number
  durationMs: number
  error?: string
  timestamp: number
}

export type VisualizerUserSummary = {
  userId: string
  color: string
  role: "controller" | "audio"
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
  role?: VisualizerClientRole
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
  | WledSyncUpdateMessage
  | WledSyncTestMessage
  | WledSyncSnapshotMessage
  | AudioSettingsSnapshotMessage
  | AudioSettingsUpdateMessage
  | AudioInstancesSnapshotMessage
  | AudioSettingsDeleteMessage
  | SongCommandMessage
  | SongTransportUpdateMessage
  | ColorControlMessage
  | UsersSnapshotMessage
  | UserJoinedMessage
  | UserLeftMessage
  | UserUpdatedMessage
  | PatchChangedMessage
  | ClearStageMessage
