/// <reference lib="webworker" />

import { StageRenderRuntime } from "./StageRenderRuntime"
import type {
  StageRenderMessage,
  StageRenderWorkerMessage,
} from "./stageRenderProtocol"

let runtime: StageRenderRuntime | null = null

function postWorkerMessage(message: StageRenderWorkerMessage) {
  self.postMessage(message)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Stage render worker failed."
}

self.onmessage = (event: MessageEvent<StageRenderMessage>) => {
  const message = event.data

  try {
    if (message.type === "init") {
      runtime?.dispose()
      runtime = new StageRenderRuntime({
        canvas: message.canvas,
        config: message.config,
        height: message.height,
        mode: "worker",
        pixelRatio: message.pixelRatio,
        width: message.width,
      })
      postWorkerMessage({ type: "ready", mode: "worker" })
      return
    }

    if (!runtime) {
      return
    }

    if (message.type === "resize") {
      runtime.resize(message)
      return
    }

    if (message.type === "audioSettingsUpsert") {
      runtime.receiveAudioSettings(message.audioInstanceId, message.settings)
      return
    }

    if (message.type === "audioSettingsDelete") {
      runtime.removeAudioInstance(message.audioInstanceId)
      return
    }

    if (message.type === "audioFrame") {
      runtime.receiveAudioFrame(message.frame)
      return
    }

    if (message.type === "pointer") {
      runtime.receivePointer(message.message)
      return
    }

    if (message.type === "colorControl") {
      runtime.receiveColorControl(message.message)
      return
    }

    if (message.type === "clearStage") {
      runtime.clear()
      return
    }

    if (message.type === "resetVisualCvRouteStates") {
      runtime.resetVisualCvRouteStates()
      return
    }

    if (message.type === "dispose") {
      runtime.dispose()
      runtime = null
    }
  } catch (error) {
    postWorkerMessage({ type: "error", error: getErrorMessage(error) })
  }
}

export {}
