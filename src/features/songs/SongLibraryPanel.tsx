"use client"

import { useRef } from "react"
import { formatDuration } from "./songFormatters"
import type { SongScanState, SongSummary } from "./songTypes"

type SongLibraryPanelProps = {
  songs: SongSummary[]
  selectedSongId: string | null
  busy: boolean
  scanState: SongScanState | null
  onUpload(file: File): void
  onRefresh(): void
  onSelectSong(songId: string): void
  onDeleteSong(song: SongSummary): void
}

function getSongStatus(song: SongSummary, scanState: SongScanState | null) {
  if (scanState?.songId === song.id) {
    return scanState.status
  }

  return song.hasAnalysis ? "scanned" : "new"
}

export function SongLibraryPanel({
  busy,
  onRefresh,
  onDeleteSong,
  onSelectSong,
  onUpload,
  scanState,
  selectedSongId,
  songs,
}: SongLibraryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <section className="song-library-panel">
      <header>
        <div>
          <p className="eyebrow">Library</p>
          <h2>Songs</h2>
        </div>
        <div className="song-library-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(event) => {
              const file = event.target.files?.[0]

              if (file) {
                onUpload(file)
              }

              if (fileInputRef.current) {
                fileInputRef.current.value = ""
              }
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload
          </button>
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      {songs.length > 0 ? (
        <div className="song-library-list">
          {songs.map((song) => (
            <div
              key={song.id}
              className="song-library-item"
              data-active={song.id === selectedSongId}
            >
              <button type="button" onClick={() => onSelectSong(song.id)}>
                <span>
                  <strong>{song.title}</strong>
                  <small>{song.originalFileName}</small>
                </span>
                <span>{formatDuration(song.durationMs)}</span>
                <span data-ready={song.hasAnalysis}>
                  {getSongStatus(song, scanState)}
                </span>
              </button>
              <button
                type="button"
                className="song-delete-button"
                onClick={() => onDeleteSong(song)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-users">Upload a song to start building the library.</p>
      )}
    </section>
  )
}
