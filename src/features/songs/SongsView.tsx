"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ControllerNav } from "@/features/controller/shared/ControllerNav"
import { useVisualizerSocket } from "@/features/controller/shared/useVisualizerSocket"
import type { SongCommandName } from "@/features/network/protocolTypes"
import { SelectedSongPlayer } from "./SelectedSongPlayer"
import { SongLibraryPanel } from "./SongLibraryPanel"
import {
  maxSongScanDurationMs,
  type SongAnalysis,
  type SongScanState,
  type SongSummary,
} from "./songTypes"

type WorkerMessage =
  | { type: "complete"; analysis: SongAnalysis }
  | { type: "error"; error: string }

function downmixAudioBuffer(audioBuffer: AudioBuffer) {
  const samples = new Float32Array(audioBuffer.length)

  for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex)

    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      samples[sampleIndex] += (channel[sampleIndex] ?? 0) / audioBuffer.numberOfChannels
    }
  }

  return samples
}

export function SongsView() {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanState, setScanState] = useState<SongScanState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const socket = useVisualizerSocket("songs")
  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? songs[0] ?? null,
    [selectedSongId, songs],
  )
  const transport = socket.songTransport

  const refreshSongs = useCallback(async () => {
    const response = await fetch("/api/songs", { cache: "no-store" })
    const data = (await response.json()) as { songs?: SongSummary[] }

    setSongs(data.songs ?? [])
    setSelectedSongId((currentSongId) => {
      if (currentSongId && data.songs?.some((song) => song.id === currentSongId)) {
        return currentSongId
      }

      return data.songs?.[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    void refreshSongs().catch((caughtError) => {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to load songs.",
      )
    })
  }, [refreshSongs])

  async function uploadSong(file: File) {
    setBusy(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set("file", file)

      const response = await fetch("/api/songs", {
        method: "POST",
        body: formData,
      })
      const data = (await response.json()) as {
        song?: SongSummary
        error?: string
      }

      if (!response.ok || !data.song) {
        throw new Error(data.error ?? "Unable to upload song.")
      }

      await refreshSongs()
      setSelectedSongId(data.song.id)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to upload song.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function scanSong(song: SongSummary) {
    setError(null)
    setScanState({ songId: song.id, status: "decoding" })

    try {
      const audioResponse = await fetch(`/api/songs/${song.id}/audio`)
      const audioData = await audioResponse.arrayBuffer()
      const AudioContextConstructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext

      if (!AudioContextConstructor) {
        throw new Error("Audio decoding is not supported in this browser.")
      }

      const audioContext = new AudioContextConstructor()
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0))
      await audioContext.close()
      const durationMs = audioBuffer.duration * 1000

      if (durationMs > maxSongScanDurationMs) {
        throw new Error("Song is longer than the 12 minute v1 scan limit.")
      }

      setScanState({ songId: song.id, status: "analyzing" })
      const samples = downmixAudioBuffer(audioBuffer)
      const worker = new Worker(new URL("./songAnalysisWorker.ts", import.meta.url), {
        type: "module",
      })
      const analysis = await new Promise<SongAnalysis>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          try {
            if (event.data.type === "complete") {
              resolve(event.data.analysis)
            }

            if (event.data.type === "error") {
              reject(new Error(event.data.error))
            }
          } finally {
            worker.terminate()
          }
        }
        worker.onerror = () => {
          worker.terminate()
          reject(new Error("Song analysis worker failed."))
        }
        worker.postMessage(
          {
            type: "analyze",
            songId: song.id,
            samples,
            sampleRate: audioBuffer.sampleRate,
            channelCount: audioBuffer.numberOfChannels,
            durationMs,
          },
          [samples.buffer],
        )
      })
      setScanState({ songId: song.id, status: "saving" })

      const saveResponse = await fetch(`/api/songs/${song.id}/analysis`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysis),
      })
      const saveData = (await saveResponse.json()) as { error?: string }

      if (!saveResponse.ok) {
        throw new Error(saveData.error ?? "Unable to save song analysis.")
      }

      await refreshSongs()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to scan song.",
      )
    } finally {
      setScanState(null)
    }
  }

  async function deleteSong(song: SongSummary) {
    const confirmed = window.confirm(`Delete "${song.title}"?`)

    if (!confirmed) {
      return
    }

    setError(null)

    try {
      const response = await fetch(`/api/songs/${song.id}`, {
        method: "DELETE",
      })
      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete song.")
      }

      if (selectedSong?.id === song.id) {
        socket.sendSongCommand({
          type: "song_command",
          command: "stop",
          timestamp: Date.now(),
        })
      }

      await refreshSongs()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to delete song.",
      )
    }
  }

  function sendSongCommand(
    command: SongCommandName,
    timeMs?: number,
  ) {
    if (!selectedSong && (command === "load" || command === "play")) {
      return
    }

    socket.sendSongCommand({
      type: "song_command",
      command,
      songId: selectedSong?.id,
      timeMs,
      timestamp: Date.now(),
    })
  }

  return (
    <main className="controller-shell songs-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Songs</h1>
        </div>
        <div className="connection-pill" data-status={socket.status}>
          {socket.status}
        </div>
      </header>

      {error ? <p className="audio-error">{error}</p> : null}

      <SongLibraryPanel
        busy={busy}
        onDeleteSong={(song) => void deleteSong(song)}
        onRefresh={() => void refreshSongs()}
        onSelectSong={setSelectedSongId}
        onUpload={(file) => void uploadSong(file)}
        scanState={scanState}
        selectedSongId={selectedSong?.id ?? null}
        songs={songs}
      />

      <SelectedSongPlayer
        onCommand={sendSongCommand}
        onScan={(song) => void scanSong(song)}
        scanState={scanState}
        song={selectedSong}
        transport={transport}
      />
    </main>
  )
}
