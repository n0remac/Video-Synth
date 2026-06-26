import type {
  AudioSettingsUpdateMessage,
  ColorControlMessage,
  PointerMessage,
  AudioSettingsDeleteMessage,
  SongCommandMessage,
  SongTransportUpdateMessage,
  StageAudioFrameMessage,
  VisualizerClientRole,
  WledSyncTestMessage,
  WledSyncUpdateMessage,
} from "./protocolTypes"

export function createPointerMessage(input: PointerMessage): PointerMessage {
  return {
    type: "pointer",
    userId: input.userId,
    userRole: input.userRole,
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

export function createAudioSettingsUpdateMessage(
  input: AudioSettingsUpdateMessage,
): AudioSettingsUpdateMessage {
  return {
    type: "audio_settings_update",
    userId: input.userId,
    audioInstanceId: input.audioInstanceId,
    settings: input.settings,
    timestamp: input.timestamp,
  }
}

export function createAudioSettingsDeleteMessage(
  input: AudioSettingsDeleteMessage,
): AudioSettingsDeleteMessage {
  return {
    type: "audio_settings_delete",
    audioInstanceId: input.audioInstanceId,
    timestamp: input.timestamp,
  }
}

export function createStageAudioFrameMessage(
  input: StageAudioFrameMessage,
): StageAudioFrameMessage {
  return {
    type: "stage_audio_frame",
    frame: input.frame,
    timestamp: input.timestamp,
  }
}

export function createWledSyncUpdateMessage(
  input: WledSyncUpdateMessage,
): WledSyncUpdateMessage {
  return {
    type: "wled_sync_update",
    config: input.config,
    enabled: input.enabled,
    timestamp: input.timestamp,
  }
}

export function createWledSyncTestMessage(
  input: WledSyncTestMessage,
): WledSyncTestMessage {
  return {
    type: "wled_sync_test",
    timestamp: input.timestamp,
  }
}

export function createSongCommandMessage(
  input: SongCommandMessage,
): SongCommandMessage {
  return {
    type: "song_command",
    command: input.command,
    songId: input.songId,
    timeMs: input.timeMs,
    timestamp: input.timestamp,
  }
}

export function createSongTransportUpdateMessage(
  input: SongTransportUpdateMessage,
): SongTransportUpdateMessage {
  return {
    type: "song_transport_update",
    songId: input.songId,
    state: input.state,
    timeMs: input.timeMs,
    durationMs: input.durationMs,
    error: input.error,
    timestamp: input.timestamp,
  }
}

export function getVisualizerSocketUrl(
  role?: VisualizerClientRole,
  options: { audioInstanceId?: string } = {},
) {
  if (typeof window === "undefined") {
    return ""
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${window.location.host}/ws`)

  if (role) {
    url.searchParams.set("role", role)
  }

  if (role === "audio" && options.audioInstanceId) {
    url.searchParams.set("audioInstanceId", options.audioInstanceId)
  }

  return url.toString()
}
