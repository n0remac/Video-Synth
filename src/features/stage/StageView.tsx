"use client"

import { useEffect } from "react"
import { useAudioAnalyser } from "@/features/audio/useAudioAnalyser"
import { useStageRuntime } from "./useStageRuntime"

export function StageView() {
  const {
    audioRoutes,
    canvasRef,
    connectionStatus,
    handleAudioTrigger,
    sendAudioFrame,
    songTransport,
    stopSong,
  } = useStageRuntime()
  const audio = useAudioAnalyser({
    routes: audioRoutes,
    onFrame: sendAudioFrame,
    onTrigger: handleAudioTrigger,
  })

  useEffect(() => {
    if (songTransport.state === "playing" && audio.running) {
      audio.stop()
    }
  }, [audio, songTransport.state])

  function toggleMicrophone() {
    if (audio.running) {
      audio.stop()
      return
    }

    stopSong()
    void audio.start()
  }

  return (
    <main className="stage-shell">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="stage-status" data-status={connectionStatus}>
        {connectionStatus}
      </div>
      <div className="stage-audio-control">
        <button
          type="button"
          onClick={toggleMicrophone}
          data-active={audio.running}
        >
          {audio.running ? "Stop Audio" : "Start Audio"}
        </button>
        <span data-status={audio.status}>{audio.status}</span>
        <span data-status={songTransport.state}>
          song {songTransport.state}
        </span>
      </div>
    </main>
  )
}
