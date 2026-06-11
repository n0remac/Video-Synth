"use client"

import { useEffect, useRef, useState } from "react"
import {
  createAudioSettingsUpdateMessage,
  createPointerMessage,
} from "@/features/network/protocol"
import type { AudioCircleSettings } from "@/features/network/protocolTypes"
import { ColorPicker } from "./components/ColorPicker"
import { ControlSlider } from "./components/ControlSlider"
import { ControllerNav } from "./components/ControllerNav"
import {
  isInTriggerRange,
  sampleSpectrumRange,
} from "./audioRoutingLogic"
import { useControllerSocket } from "./useControllerSocket"

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

const defaultAudioSettings: AudioCircleSettings = {
  sampleStartPercent: 0,
  sampleEndPercent: 20,
  triggerMin: 0.25,
  triggerMax: 1,
  gain: 1,
  cooldownMs: 250,
  circleColor: "#00d1ff",
}

export function AudioControllerView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousInsideRef = useRef(false)
  const lastTriggeredAtRef = useRef(0)
  const socket = useControllerSocket("audio")
  const stageAudioFrame = socket.stageAudioFrame
  const [settings, setSettings] =
    useState<AudioCircleSettings>(defaultAudioSettings)
  const [sampleValue, setSampleValue] = useState(0)

  useEffect(() => {
    if (socket.audioSettings) {
      setSettings(socket.audioSettings)
    }
  }, [socket.audioSettings])

  function updateSettings(patch: Partial<AudioCircleSettings>) {
    setSettings((currentSettings) => {
      const nextSettings = {
        ...currentSettings,
        ...patch,
      }

      socket.sendAudioSettingsUpdate(
        createAudioSettingsUpdateMessage({
          type: "audio_settings_update",
          userId: socket.userId,
          settings: nextSettings,
          timestamp: Date.now(),
        }),
      )

      return nextSettings
    })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const spectrum = stageAudioFrame?.spectrum

    if (!canvas || !spectrum) {
      return
    }

    const context = canvas.getContext("2d")

    if (!context) {
      return
    }

    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    canvas.width = Math.floor(width * pixelRatio)
    canvas.height = Math.floor(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = "#101014"
    context.fillRect(0, 0, width, height)

    const gap = 3
    const barWidth = Math.max(
      2,
      (width - gap * (spectrum.length - 1)) / spectrum.length,
    )
    const rangeStart =
      Math.min(settings.sampleStartPercent, settings.sampleEndPercent) / 100
    const rangeEnd =
      Math.max(settings.sampleStartPercent, settings.sampleEndPercent) / 100

    context.fillStyle = "rgba(0, 209, 255, 0.12)"
    context.fillRect(rangeStart * width, 0, (rangeEnd - rangeStart) * width, height)

    spectrum.forEach((value, index) => {
      const x = index * (barWidth + gap)
      const barHeight = Math.max(2, value * height)
      const hue = 190 + index / Math.max(spectrum.length - 1, 1) * 110

      context.fillStyle = `hsl(${hue}, 95%, ${42 + value * 30}%)`
      context.fillRect(x, height - barHeight, barWidth, barHeight)
    })
  }, [stageAudioFrame, settings.sampleEndPercent, settings.sampleStartPercent])

  useEffect(() => {
    const spectrum = stageAudioFrame?.spectrum

    if (!spectrum || !socket.connected) {
      return
    }

    const nextSampleValue = clamp(
      sampleSpectrumRange(
        spectrum,
        settings.sampleStartPercent,
        settings.sampleEndPercent,
      ) * settings.gain,
      0,
      1,
    )
    const inside = isInTriggerRange(
      nextSampleValue,
      settings.triggerMin,
      settings.triggerMax,
    )
    const now = Date.now()

    setSampleValue(nextSampleValue)

    if (
      inside &&
      !previousInsideRef.current &&
      now - lastTriggeredAtRef.current >= settings.cooldownMs
    ) {
      socket.sendPointer(
        createPointerMessage({
          type: "pointer",
          userId: socket.userId,
          x: Math.random(),
          y: Math.random(),
          vx: 0,
          vy: 0,
          speed: nextSampleValue * 4,
          down: true,
          color: settings.circleColor,
          visualMode: "circle",
          trailLineCount: 3,
          trailLength: 1.2,
          timestamp: now,
        }),
      )
      lastTriggeredAtRef.current = now
    }

    previousInsideRef.current = inside
  }, [
    stageAudioFrame,
    settings,
    socket,
  ])

  return (
    <main className="controller-shell audio-controller-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Audio</h1>
        </div>
        <div
          className="connection-pill"
          data-status={stageAudioFrame ? "connected" : "connecting"}
        >
          {stageAudioFrame ? "stage audio" : "waiting"}
        </div>
      </header>

      <section className="audio-spectrum-panel">
        <canvas ref={canvasRef} className="audio-spectrum-canvas" />
      </section>

      <section className="audio-control-panel">
        <div className="audio-meter">
          <span>Source</span>
          <strong>{stageAudioFrame ? "Stage" : "None"}</strong>
        </div>
        <div className="audio-meter">
          <span>Sample</span>
          <strong>{formatPercent(sampleValue)}</strong>
        </div>
        <div className="audio-meter">
          <span>Volume</span>
          <strong>{formatPercent(stageAudioFrame?.volume)}</strong>
        </div>
        <div className="audio-meter">
          <span>Low</span>
          <strong>{formatPercent(stageAudioFrame?.low)}</strong>
        </div>
        <div className="audio-meter">
          <span>Mid</span>
          <strong>{formatPercent(stageAudioFrame?.mid)}</strong>
        </div>
        <div className="audio-meter">
          <span>High</span>
          <strong>{formatPercent(stageAudioFrame?.high)}</strong>
        </div>
      </section>

      <section className="audio-simple-panel">
        <ColorPicker
          color={settings.circleColor}
          onColorChange={(circleColor) => updateSettings({ circleColor })}
        />
        <ControlSlider
          label="Sample Start"
          value={settings.sampleStartPercent}
          min={0}
          max={100}
          step={1}
          onValueChange={(sampleStartPercent) =>
            updateSettings({ sampleStartPercent })
          }
        />
        <ControlSlider
          label="Sample End"
          value={settings.sampleEndPercent}
          min={0}
          max={100}
          step={1}
          onValueChange={(sampleEndPercent) =>
            updateSettings({ sampleEndPercent })
          }
        />
        <ControlSlider
          label="Trigger Min"
          value={settings.triggerMin}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(triggerMin) => updateSettings({ triggerMin })}
        />
        <ControlSlider
          label="Trigger Max"
          value={settings.triggerMax}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(triggerMax) => updateSettings({ triggerMax })}
        />
        <ControlSlider
          label="Gain"
          value={settings.gain}
          min={0.1}
          max={6}
          step={0.05}
          onValueChange={(gain) => updateSettings({ gain })}
        />
        <ControlSlider
          label="Cooldown"
          value={settings.cooldownMs}
          min={50}
          max={1200}
          step={25}
          onValueChange={(cooldownMs) => updateSettings({ cooldownMs })}
        />
      </section>

      {!stageAudioFrame ? (
        <p className="audio-error">Start audio on the stage screen.</p>
      ) : null}
    </main>
  )
}
