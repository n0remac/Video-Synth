/// <reference lib="webworker" />

import { analyzeMonoSamples } from "./songAnalysisLogic"

type AnalyzeMessage = {
  type: "analyze"
  songId: string
  samples: Float32Array
  sampleRate: number
  channelCount: number
  durationMs: number
}

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  const message = event.data

  if (message.type !== "analyze") {
    return
  }

  try {
    const analysis = analyzeMonoSamples({
      channelCount: message.channelCount,
      durationMs: message.durationMs,
      samples: message.samples,
      sampleRate: message.sampleRate,
      songId: message.songId,
    })

    self.postMessage({ type: "complete", analysis })
  } catch (error) {
    self.postMessage({
      type: "error",
      error:
        error instanceof Error ? error.message : "Unable to analyze audio file.",
    })
  }
}

export {}
