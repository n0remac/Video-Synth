"use client"

import { useEffect } from "react"
import { useAudioInputDevices } from "@/features/audio/useAudioInputDevices"
import { useAudioAnalyser } from "@/features/audio/useAudioAnalyser"
import { useStageRuntime } from "./useStageRuntime"

export function StageView() {
  const {
    audioRoutes,
    canvasRef,
    connectionStatus,
    sendAudioFrame,
    songTransport,
    stopSong,
  } = useStageRuntime()
  const audio = useAudioAnalyser({
    routes: audioRoutes,
    onFrame: sendAudioFrame,
  })
  const audioInputDevices = useAudioInputDevices()

  useEffect(() => {
    if (songTransport.state === "playing" && audio.running) {
      audio.stop()
    }
  }, [audio, songTransport.state])

  async function toggleLiveInput() {
    if (audio.running) {
      audio.stop()
      return
    }

    stopSong()
    await audio.start({
      deviceId: audioInputDevices.selectedDeviceId || undefined,
    })
    void audioInputDevices.refresh()
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
          onClick={() => void toggleLiveInput()}
          data-active={audio.running}
        >
          {audio.running ? "Stop Live Input" : "Start Live Input"}
        </button>
        <select
          aria-label="Live audio input device"
          value={audioInputDevices.selectedDeviceId}
          disabled={audio.running || audioInputDevices.status === "not-supported"}
          onChange={(event) => {
            audioInputDevices.setSelectedDeviceId(event.target.value)
          }}
        >
          {audioInputDevices.deviceOptions.map((device) => (
            <option key={device.deviceId || "system-default"} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
        <span data-status={audio.status}>{audio.status}</span>
        {audio.error ? <span data-status="error">{audio.error}</span> : null}
        {audioInputDevices.error ? (
          <span data-status="error">{audioInputDevices.error}</span>
        ) : null}
        <span data-status={songTransport.state}>
          song {songTransport.state}
        </span>
      </div>
    </main>
  )
}
