"use client"

import type {
  SongCommandName,
  SongTransportUpdateMessage,
} from "@/features/network/protocolTypes"
import { formatDuration, formatTransportTime } from "./songFormatters"
import type { SongScanState, SongSummary } from "./songTypes"

type SelectedSongPlayerProps = {
  song: SongSummary | null
  transport: SongTransportUpdateMessage | null
  scanState: SongScanState | null
  onScan(song: SongSummary): void
  onCommand(command: SongCommandName, timeMs?: number): void
}

export function SelectedSongPlayer({
  onCommand,
  onScan,
  scanState,
  song,
  transport,
}: SelectedSongPlayerProps) {
  const isScanning = Boolean(song && scanState?.songId === song.id)

  return (
    <section className="selected-song-player">
      {song ? (
        <>
          <header>
            <div>
              <p className="eyebrow">Selected</p>
              <h2>{song.title}</h2>
            </div>
            <span data-ready={song.hasAnalysis}>
              {isScanning
                ? scanState?.status
                : song.hasAnalysis
                  ? "analysis ready"
                  : "needs scan"}
            </span>
          </header>

          <div className="selected-song-grid">
            <div>
              <span>Duration</span>
              <strong>{formatDuration(song.durationMs)}</strong>
            </div>
            <div>
              <span>Transport</span>
              <strong>{transport?.state ?? "idle"}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>
                {transport
                  ? formatTransportTime(transport.timeMs, transport.durationMs)
                  : "--:-- / --:--"}
              </strong>
            </div>
          </div>

          <div className="song-transport-controls">
            <button
              type="button"
              disabled={!song.hasAnalysis}
              onClick={() => onCommand("load")}
            >
              Load
            </button>
            <button
              type="button"
              disabled={!song.hasAnalysis}
              onClick={() => onCommand("play")}
            >
              Play
            </button>
            <button type="button" onClick={() => onCommand("pause")}>
              Pause
            </button>
            <button type="button" onClick={() => onCommand("stop")}>
              Stop
            </button>
          </div>

          <label className="song-seek">
            <span>Seek</span>
            <input
              type="range"
              min={0}
              max={Math.max(transport?.durationMs ?? song.durationMs ?? 0, 0)}
              step={100}
              value={transport?.timeMs ?? 0}
              onChange={(event) =>
                onCommand("seek", Number(event.currentTarget.value))
              }
            />
          </label>

          <button
            type="button"
            className="song-scan-button"
            disabled={scanState !== null}
            onClick={() => onScan(song)}
          >
            {song.hasAnalysis ? "Rescan" : "Scan"}
          </button>
        </>
      ) : (
        <p className="empty-users">Select or upload a song to control playback.</p>
      )}
    </section>
  )
}
