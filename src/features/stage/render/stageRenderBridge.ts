"use client"

import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  ColorControlMessage,
  PointerMessage,
} from "@/features/network/protocolTypes"
import { stageConfig, type StageConfig } from "@/features/stage/stageConfig"
import { StageRenderRuntime } from "./StageRenderRuntime"
import type {
  StageRenderMessage,
  StageRenderMode,
  StageRenderViewport,
  StageRenderWorkerMessage,
} from "./stageRenderProtocol"

type StageRenderBridgeOptions = StageRenderViewport & {
  canvas: HTMLCanvasElement
  config?: StageConfig
  onError?(error: string): void
  onReady?(mode: StageRenderMode): void
}

export type StageRenderBridge = {
  mode: StageRenderMode
  resize(viewport: StageRenderViewport): void
  receiveAudioSettings(audioInstanceId: string, settings: AudioCircleSettings): void
  removeAudioInstance(audioInstanceId: string): void
  receiveAudioFrame(frame: AudioAnalysisFrame): void
  receivePointer(message: PointerMessage): void
  receiveColorControl(message: ColorControlMessage): void
  clear(): void
  resetVisualCvRouteStates(): void
  dispose(): void
}

function canUseOffscreenCanvas(canvas: HTMLCanvasElement) {
  if (
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined" ||
    typeof canvas.transferControlToOffscreen !== "function"
  ) {
    return false
  }

  try {
    const testCanvas = new OffscreenCanvas(1, 1)
    const context =
      testCanvas.getContext("webgl2") ?? testCanvas.getContext("webgl")

    return Boolean(context)
  } catch {
    return false
  }
}

function postWorkerMessage(worker: Worker, message: StageRenderMessage) {
  worker.postMessage(message)
}

function createWorkerBridge({
  canvas,
  config = stageConfig,
  height,
  onError,
  onReady,
  pixelRatio,
  width,
}: StageRenderBridgeOptions): StageRenderBridge {
  const offscreenCanvas = canvas.transferControlToOffscreen()
  const worker = new Worker(new URL("./stageRenderWorker.ts", import.meta.url), {
    type: "module",
  })

  worker.onmessage = (event: MessageEvent<StageRenderWorkerMessage>) => {
    if (event.data.type === "ready") {
      onReady?.(event.data.mode)
      return
    }

    if (event.data.type === "error") {
      onError?.(event.data.error)
    }
  }

  worker.onerror = () => {
    onError?.("Stage render worker failed.")
  }

  worker.postMessage(
    {
      type: "init",
      canvas: offscreenCanvas,
      config,
      height,
      pixelRatio,
      width,
    } satisfies StageRenderMessage,
    [offscreenCanvas],
  )

  return {
    mode: "worker",
    resize(viewport) {
      postWorkerMessage(worker, { type: "resize", ...viewport })
    },
    receiveAudioSettings(audioInstanceId, settings) {
      postWorkerMessage(worker, {
        type: "audioSettingsUpsert",
        audioInstanceId,
        settings,
      })
    },
    removeAudioInstance(audioInstanceId) {
      postWorkerMessage(worker, {
        type: "audioSettingsDelete",
        audioInstanceId,
      })
    },
    receiveAudioFrame(frame) {
      postWorkerMessage(worker, { type: "audioFrame", frame })
    },
    receivePointer(message) {
      postWorkerMessage(worker, { type: "pointer", message })
    },
    receiveColorControl(message) {
      postWorkerMessage(worker, { type: "colorControl", message })
    },
    clear() {
      postWorkerMessage(worker, { type: "clearStage" })
    },
    resetVisualCvRouteStates() {
      postWorkerMessage(worker, { type: "resetVisualCvRouteStates" })
    },
    dispose() {
      postWorkerMessage(worker, { type: "dispose" })
      worker.terminate()
    },
  }
}

function createMainThreadBridge({
  canvas,
  config = stageConfig,
  height,
  onReady,
  pixelRatio,
  width,
}: StageRenderBridgeOptions): StageRenderBridge {
  const runtime = new StageRenderRuntime({
    canvas,
    config,
    height,
    mode: "main",
    pixelRatio,
    width,
  })

  onReady?.("main")

  return {
    mode: "main",
    resize(viewport) {
      runtime.resize(viewport)
    },
    receiveAudioSettings(audioInstanceId, settings) {
      runtime.receiveAudioSettings(audioInstanceId, settings)
    },
    removeAudioInstance(audioInstanceId) {
      runtime.removeAudioInstance(audioInstanceId)
    },
    receiveAudioFrame(frame) {
      runtime.receiveAudioFrame(frame)
    },
    receivePointer(message) {
      runtime.receivePointer(message)
    },
    receiveColorControl(message) {
      runtime.receiveColorControl(message)
    },
    clear() {
      runtime.clear()
    },
    resetVisualCvRouteStates() {
      runtime.resetVisualCvRouteStates()
    },
    dispose() {
      runtime.dispose()
    },
  }
}

export function createStageRenderBridge(
  options: StageRenderBridgeOptions,
): StageRenderBridge {
  if (canUseOffscreenCanvas(options.canvas)) {
    return createWorkerBridge(options)
  }

  return createMainThreadBridge(options)
}
