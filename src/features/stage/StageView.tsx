"use client"

import { useAudioAnalyser } from "@/features/audio/useAudioAnalyser"
import { useStageRuntime } from "./useStageRuntime"

export function StageView() {
  const {
    audioRoutes,
    canvasRef,
    connectionStatus,
    handleAudioTrigger,
    sendAudioFrame,
  } = useStageRuntime()
  const audio = useAudioAnalyser({
    routes: audioRoutes,
    onFrame: sendAudioFrame,
    onTrigger: handleAudioTrigger,
  })

  return (
    <main className="stage-shell">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="stage-status" data-status={connectionStatus}>
        {connectionStatus}
      </div>
      <div className="stage-audio-control">
        <button
          type="button"
          onClick={audio.running ? audio.stop : audio.start}
          data-active={audio.running}
        >
          {audio.running ? "Stop Audio" : "Start Audio"}
        </button>
        <span data-status={audio.status}>{audio.status}</span>
      </div>
    </main>
  )
}
