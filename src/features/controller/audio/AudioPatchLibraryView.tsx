"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createAudioSettingsUpdateMessage } from "@/features/network/protocol"
import type { AudioCircleSettings } from "@/features/network/protocolTypes"
import { ControllerNav } from "../shared/ControllerNav"
import { useVisualizerSocket } from "../shared/useVisualizerSocket"
import { blendAudioSettings } from "./audioPatchFade"
import type { SavedAudioPatch } from "./audioPatchTypes"

type PatchLoadState = "loading" | "ready" | "error"

type AudioPatchLibraryViewProps = {
  initialTarget?: string
}

function formatPatchTimestamp(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Saved patch"
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function getPatchTone(index: number) {
  const tones = ["cyan", "green", "yellow", "pink", "violet", "orange"]

  return tones[index % tones.length]
}

export function AudioPatchLibraryView({
  initialTarget,
}: AudioPatchLibraryViewProps) {
  const router = useRouter()
  const socket = useVisualizerSocket("audio-patches")
  const [patches, setPatches] = useState<SavedAudioPatch[]>([])
  const [loadState, setLoadState] = useState<PatchLoadState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [patchName, setPatchName] = useState("")
  const [selectedAudioInstanceId, setSelectedAudioInstanceId] = useState("")
  const [fadeDurationSeconds, setFadeDurationSeconds] = useState(2)
  const [activePatchId, setActivePatchId] = useState<string | null>(null)
  const [fadingPatchId, setFadingPatchId] = useState<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const currentSettings = selectedAudioInstanceId
    ? socket.audioSettingsByInstance[selectedAudioInstanceId] ?? null
    : null

  const cancelFade = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    setFadingPatchId(null)
  }, [])

  const sendSettingsUpdate = useCallback(
    (audioInstanceId: string, settings: AudioCircleSettings) => {
      socket.sendAudioSettingsUpdate(
        createAudioSettingsUpdateMessage({
          type: "audio_settings_update",
          userId: socket.userId,
          audioInstanceId,
          settings,
          timestamp: Date.now(),
        }),
      )
    },
    [socket],
  )

  useEffect(() => {
    let canceled = false

    async function loadPatches() {
      try {
        setLoadState("loading")
        const response = await fetch("/api/audio-patches", { cache: "no-store" })

        if (!response.ok) {
          throw new Error("Unable to load audio patches.")
        }

        const body = (await response.json()) as { patches: SavedAudioPatch[] }

        if (!canceled) {
          setPatches(body.patches)
          setLoadState("ready")
        }
      } catch (loadError) {
        if (!canceled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load audio patches.",
          )
          setLoadState("error")
        }
      }
    }

    void loadPatches()

    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (
      initialTarget &&
      socket.audioInstances.some(
        (instance) => instance.audioInstanceId === initialTarget,
      )
    ) {
      setSelectedAudioInstanceId(initialTarget)
      return
    }

    if (
      selectedAudioInstanceId &&
      socket.audioInstances.some(
        (instance) => instance.audioInstanceId === selectedAudioInstanceId,
      )
    ) {
      return
    }

    setSelectedAudioInstanceId(socket.audioInstances[0]?.audioInstanceId ?? "")
  }, [initialTarget, selectedAudioInstanceId, socket.audioInstances])

  useEffect(() => cancelFade, [cancelFade])

  async function saveCurrentPatch() {
    if (!currentSettings) {
      return
    }

    try {
      setError(null)
      const response = await fetch("/api/audio-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patchName,
          settings: currentSettings,
        }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null

        throw new Error(body?.error ?? "Unable to save audio patch.")
      }

      const body = (await response.json()) as { patch: SavedAudioPatch }

      setPatches((currentPatches) => [body.patch, ...currentPatches])
      setPatchName("")
      setActivePatchId(body.patch.id)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save audio patch.",
      )
    }
  }

  async function deletePatch(patchId: string) {
    try {
      setError(null)
      const response = await fetch(`/api/audio-patches/${patchId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Unable to delete audio patch.")
      }

      setPatches((currentPatches) =>
        currentPatches.filter((patch) => patch.id !== patchId),
      )

      if (activePatchId === patchId) {
        setActivePatchId(null)
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete audio patch.",
      )
    }
  }

  function applyPatch(patch: SavedAudioPatch) {
    if (!selectedAudioInstanceId || !currentSettings || !socket.connected) {
      return
    }

    cancelFade()

    const durationMs = Math.max(fadeDurationSeconds, 0) * 1000

    if (durationMs === 0) {
      sendSettingsUpdate(selectedAudioInstanceId, patch.settings)
      setActivePatchId(patch.id)
      return
    }

    const startedAt = window.performance.now()
    const fromSettings = currentSettings
    const targetAudioInstanceId = selectedAudioInstanceId
    let lastSentAt = 0

    setFadingPatchId(patch.id)

    function step(now: number) {
      const progress = Math.min(Math.max((now - startedAt) / durationMs, 0), 1)

      if (progress === 1 || now - lastSentAt >= 50) {
        sendSettingsUpdate(
          targetAudioInstanceId,
          blendAudioSettings(fromSettings, patch.settings, progress),
        )
        lastSentAt = now
      }

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step)
        return
      }

      animationFrameRef.current = null
      setFadingPatchId(null)
      setActivePatchId(patch.id)
    }

    animationFrameRef.current = window.requestAnimationFrame(step)
  }

  const canSave = Boolean(currentSettings && socket.connected)
  const canApply = Boolean(currentSettings && socket.connected)

  return (
    <main className="controller-shell audio-patches-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Audio Patches</h1>
        </div>
        <div
          className="connection-pill"
          data-status={socket.connected ? "connected" : socket.status}
        >
          {socket.connected ? "patch bus" : socket.status}
        </div>
      </header>

      <section className="audio-patch-toolbar">
        <label className="control-field">
          <span>
            Controller
            <strong>{selectedAudioInstanceId || "None"}</strong>
          </span>
          <select
            value={selectedAudioInstanceId}
            onChange={(event) => setSelectedAudioInstanceId(event.currentTarget.value)}
          >
            {socket.audioInstances.length === 0 ? (
              <option value="">No audio controllers</option>
            ) : null}
            {socket.audioInstances.map((instance) => (
              <option
                key={instance.audioInstanceId}
                value={instance.audioInstanceId}
              >
                {instance.audioInstanceId}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span>
            Patch Name
            <strong>{patchName.trim() || "Untitled"}</strong>
          </span>
          <input
            type="text"
            value={patchName}
            maxLength={80}
            onChange={(event) => setPatchName(event.currentTarget.value)}
          />
        </label>

        <label className="control-field">
          <span>
            Fade
            <strong>{fadeDurationSeconds.toFixed(2)}s</strong>
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.25}
            value={fadeDurationSeconds}
            onChange={(event) =>
              setFadeDurationSeconds(Number(event.currentTarget.value))
            }
          />
        </label>

        <button
          type="button"
          className="audio-patch-action"
          disabled={!canSave}
          onClick={saveCurrentPatch}
        >
          Save Current
        </button>

        <button
          type="button"
          className="audio-patch-action secondary"
          disabled={!selectedAudioInstanceId}
          onClick={() => router.push(`/audio-controller/${selectedAudioInstanceId}`)}
        >
          Edit
        </button>
      </section>

      {error ? <p className="audio-error">{error}</p> : null}

      <section className="audio-patch-status-grid">
        <div className="audio-meter">
          <span>Saved</span>
          <strong>{patches.length}</strong>
        </div>
        <div className="audio-meter">
          <span>Target</span>
          <strong>{selectedAudioInstanceId || "None"}</strong>
        </div>
        <div className="audio-meter">
          <span>Settings</span>
          <strong>{currentSettings ? "Ready" : "Waiting"}</strong>
        </div>
        <div className="audio-meter">
          <span>Fade</span>
          <strong>{fadingPatchId ? "Running" : "Idle"}</strong>
        </div>
      </section>

      <section className="audio-patch-grid" aria-label="Saved audio patches">
        {loadState === "loading" ? (
          <div className="audio-patch-empty">Loading patches</div>
        ) : null}

        {loadState !== "loading" && patches.length === 0 ? (
          <div className="audio-patch-empty">No saved patches</div>
        ) : null}

        {patches.map((patch, index) => {
          const isActive = patch.id === activePatchId
          const isFading = patch.id === fadingPatchId

          return (
            <article
              key={patch.id}
              className="audio-patch-card"
              data-tone={getPatchTone(index)}
              data-active={isActive}
              data-fading={isFading}
            >
              <button
                type="button"
                className="audio-patch-button"
                disabled={!canApply}
                onClick={() => applyPatch(patch)}
              >
                <span>{patch.name}</span>
                <strong>{isFading ? "Fading" : isActive ? "Active" : "Apply"}</strong>
                <small>{formatPatchTimestamp(patch.updatedAt)}</small>
              </button>
              <button
                type="button"
                className="audio-patch-delete"
                aria-label={`Delete ${patch.name}`}
                onClick={() => deletePatch(patch.id)}
              >
                Delete
              </button>
            </article>
          )
        })}
      </section>
    </main>
  )
}
