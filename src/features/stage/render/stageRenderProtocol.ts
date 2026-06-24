import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  ColorControlMessage,
  PointerMessage,
} from "@/features/network/protocolTypes"
import type { StageConfig } from "@/features/stage/stageConfig"

export type StageRenderMode = "main" | "worker"

export type StageRenderViewport = {
  width: number
  height: number
  pixelRatio: number
}

export type StageRenderInitMessage = StageRenderViewport & {
  type: "init"
  canvas: OffscreenCanvas
  config: StageConfig
}

export type StageRenderMessage =
  | StageRenderInitMessage
  | (StageRenderViewport & { type: "resize" })
  | {
      type: "audioSettingsUpsert"
      audioInstanceId: string
      settings: AudioCircleSettings
    }
  | {
      type: "audioSettingsDelete"
      audioInstanceId: string
    }
  | {
      type: "audioFrame"
      frame: AudioAnalysisFrame
    }
  | {
      type: "pointer"
      message: PointerMessage
    }
  | {
      type: "colorControl"
      message: ColorControlMessage
    }
  | {
      type: "clearStage"
    }
  | {
      type: "resetVisualCvRouteStates"
    }
  | {
      type: "dispose"
    }

export type StageRenderWorkerMessage =
  | {
      type: "ready"
      mode: StageRenderMode
    }
  | {
      type: "error"
      error: string
    }
