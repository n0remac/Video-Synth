"use client"

import { useEffect, useRef } from "react"
import { useAudioAnalyser } from "@/features/audio/useAudioAnalyser"
import { useStageRuntime } from "./useStageRuntime"

export function StageView() {
  const { canvasRef, connectionStatus, sendAudioFrame } = useStageRuntime()
  const audio = useAudioAnalyser()
  const lastSentAtRef = useRef(0)

  useEffect(() => {
    if (!audio.frame || !audio.running) {
      return
    }

    const now = Date.now()

    if (now - lastSentAtRef.current < 1000 / 20) {
      return
    }

    lastSentAtRef.current = now
    sendAudioFrame(audio.frame)
  }, [audio.frame, audio.running, sendAudioFrame])

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
