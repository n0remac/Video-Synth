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
  isAboveTriggerLevel,
  sampleSpectrumRange,
  updateAdaptiveTriggerState,
} from "./audioRoutingLogic"
import type { AdaptiveTriggerState } from "./audioRoutingLogic"
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
  triggerMode: "manual",
  triggerLevel: 0.25,
  adaptiveSensitivity: 0.6,
  adaptiveSpeed: 0.08,
  gain: 1,
  cooldownMs: 250,
  circleColor: "#00d1ff",
}

export function AudioControllerView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousInsideRef = useRef(false)
  const lastTriggeredAtRef = useRef(0)
  const adaptiveTriggerRef = useRef<AdaptiveTriggerState | null>(null)
  const socket = useControllerSocket("audio")
  const stageAudioFrame = socket.stageAudioFrame
  const [settings, setSettings] =
    useState<AudioCircleSettings>(defaultAudioSettings)
  const [adaptiveTriggerState, setAdaptiveTriggerState] =
    useState<AdaptiveTriggerState | null>(null)
  const [rawSampleValue, setRawSampleValue] = useState(0)
  const [sampleValue, setSampleValue] = useState(0)
  const displayedTriggerLevel =
    settings.triggerMode === "adaptive" && adaptiveTriggerState
      ? adaptiveTriggerState.triggerLevel
      : settings.triggerLevel

  useEffect(() => {
    if (socket.audioSettings) {
      setSettings(socket.audioSettings)
    }
  }, [socket.audioSettings])

  useEffect(() => {
    adaptiveTriggerRef.current = null
    setAdaptiveTriggerState(null)
    previousInsideRef.current = false
  }, [
    settings.adaptiveSpeed,
    settings.adaptiveSensitivity,
    settings.gain,
    settings.sampleEndPercent,
    settings.sampleStartPercent,
    settings.triggerMode,
  ])

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
    const rawSample = sampleSpectrumRange(
      spectrum,
      settings.sampleStartPercent,
      settings.sampleEndPercent,
    )
    const signalValue = clamp(rawSample * settings.gain, 0, 1)
    const effectiveTriggerLevel =
      settings.triggerMode === "adaptive" && adaptiveTriggerState
        ? adaptiveTriggerState.triggerLevel
        : settings.triggerLevel
    const isTriggered = isAboveTriggerLevel(signalValue, effectiveTriggerLevel)
    const visualRangeWidth = Math.max((rangeEnd - rangeStart) * width, 2)
    const rangeX = clamp(rangeStart * width, 0, Math.max(width - visualRangeWidth, 0))

    context.fillStyle = isTriggered
      ? "rgba(255, 225, 86, 0.16)"
      : "rgba(0, 209, 255, 0.12)"
    context.fillRect(
      rangeX,
      0,
      visualRangeWidth,
      height,
    )

    const triggerY = height * (1 - clamp(effectiveTriggerLevel, 0, 1))
    const signalY = height * (1 - signalValue)

    context.fillStyle = "rgba(255, 225, 86, 0.08)"
    context.fillRect(rangeX, 0, visualRangeWidth, triggerY)

    if (settings.triggerMode === "adaptive" && adaptiveTriggerState) {
      const floorY = height * (1 - adaptiveTriggerState.floor)
      const ceilingY = height * (1 - adaptiveTriggerState.ceiling)

      context.fillStyle = "rgba(247, 247, 255, 0.08)"
      context.fillRect(rangeX, ceilingY, visualRangeWidth, floorY - ceilingY)
    }

    spectrum.forEach((value, index) => {
      const x = index * (barWidth + gap)
      const barHeight = Math.max(2, value * height)
      const hue = 190 + index / Math.max(spectrum.length - 1, 1) * 110

      context.fillStyle = `hsl(${hue}, 95%, ${42 + value * 30}%)`
      context.fillRect(x, height - barHeight, barWidth, barHeight)
    })

    context.fillStyle = isTriggered
      ? "rgba(60, 255, 158, 0.24)"
      : "rgba(0, 209, 255, 0.2)"
    context.fillRect(rangeX, signalY, visualRangeWidth, height - signalY)

    context.strokeStyle = "#ffe156"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(0, triggerY)
    context.lineTo(width, triggerY)
    context.stroke()

    if (settings.triggerMode === "adaptive" && adaptiveTriggerState) {
      const floorY = height * (1 - adaptiveTriggerState.floor)
      const ceilingY = height * (1 - adaptiveTriggerState.ceiling)

      context.strokeStyle = "rgba(247, 247, 255, 0.38)"
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(rangeX, ceilingY)
      context.lineTo(rangeX + visualRangeWidth, ceilingY)
      context.moveTo(rangeX, floorY)
      context.lineTo(rangeX + visualRangeWidth, floorY)
      context.stroke()
    }

    context.strokeStyle = "#f7f7ff"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(rangeX, signalY)
    context.lineTo(rangeX + visualRangeWidth, signalY)
    context.stroke()

    const badgeText = `Signal ${formatPercent(signalValue)}`
    context.font = "700 12px sans-serif"
    const badgePaddingX = 8
    const badgeHeight = 24
    const badgeWidth = context.measureText(badgeText).width + badgePaddingX * 2
    const badgeX = clamp(
      rangeX + visualRangeWidth - badgeWidth - 6,
      6,
      Math.max(6, width - badgeWidth - 6),
    )
    const badgeY = clamp(signalY - badgeHeight - 6, 6, height - badgeHeight - 6)

    context.fillStyle = "rgba(5, 5, 5, 0.78)"
    context.fillRect(badgeX, badgeY, badgeWidth, badgeHeight)
    context.fillStyle = "#f7f7ff"
    context.fillText(badgeText, badgeX + badgePaddingX, badgeY + 16)
  }, [
    stageAudioFrame,
    adaptiveTriggerState,
    settings.gain,
    settings.triggerMode,
    settings.sampleEndPercent,
    settings.sampleStartPercent,
    settings.triggerLevel,
  ])

  useEffect(() => {
    const spectrum = stageAudioFrame?.spectrum

    if (!spectrum || !socket.connected) {
      return
    }

    const nextRawSampleValue = sampleSpectrumRange(
      spectrum,
      settings.sampleStartPercent,
      settings.sampleEndPercent,
    )
    const nextSampleValue = clamp(nextRawSampleValue * settings.gain, 0, 1)
    let nextTriggerLevel = settings.triggerLevel

    if (settings.triggerMode === "adaptive") {
      const nextAdaptiveTriggerState = updateAdaptiveTriggerState(
        adaptiveTriggerRef.current,
        nextSampleValue,
        {
          sensitivity: settings.adaptiveSensitivity,
          adaptSpeed: settings.adaptiveSpeed,
        },
      )

      adaptiveTriggerRef.current = nextAdaptiveTriggerState
      setAdaptiveTriggerState(nextAdaptiveTriggerState)
      nextTriggerLevel = nextAdaptiveTriggerState.triggerLevel
    }

    const inside = isAboveTriggerLevel(nextSampleValue, nextTriggerLevel)
    const now = Date.now()

    setRawSampleValue(nextRawSampleValue)
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
          <span>Raw Avg</span>
          <strong>{formatPercent(rawSampleValue)}</strong>
        </div>
        <div className="audio-meter">
          <span>Signal</span>
          <strong>{formatPercent(sampleValue)}</strong>
        </div>
        <div className="audio-meter">
          <span>Trigger</span>
          <strong>{formatPercent(displayedTriggerLevel)}</strong>
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
        <div className="control-field">
          <span>
            Trigger Mode <strong>{settings.triggerMode}</strong>
          </span>
          <div className="mode-toggle">
            <button
              type="button"
              data-active={settings.triggerMode === "manual"}
              onClick={() => updateSettings({ triggerMode: "manual" })}
            >
              Manual
            </button>
            <button
              type="button"
              data-active={settings.triggerMode === "adaptive"}
              onClick={() => updateSettings({ triggerMode: "adaptive" })}
            >
              Adaptive
            </button>
          </div>
        </div>
        {settings.triggerMode === "manual" ? (
          <ControlSlider
            label="Trigger Level"
            value={settings.triggerLevel}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(triggerLevel) => updateSettings({ triggerLevel })}
          />
        ) : (
          <>
            <ControlSlider
              label="Sensitivity"
              value={settings.adaptiveSensitivity}
              min={0.1}
              max={0.9}
              step={0.01}
              onValueChange={(adaptiveSensitivity) =>
                updateSettings({ adaptiveSensitivity })
              }
            />
            <ControlSlider
              label="Adapt Speed"
              value={settings.adaptiveSpeed}
              min={0.01}
              max={0.4}
              step={0.01}
              onValueChange={(adaptiveSpeed) =>
                updateSettings({ adaptiveSpeed })
              }
            />
          </>
        )}
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
