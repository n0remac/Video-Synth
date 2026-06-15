"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createAudioSettingsUpdateMessage } from "@/features/network/protocol"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
} from "@/features/network/protocolTypes"
import { ColorPicker } from "../shared/ColorPicker"
import { ControlSlider } from "../shared/ControlSlider"
import { ControllerNav } from "../shared/ControllerNav"
import {
  updateAudioLevelMotionState,
  isAboveTriggerLevel,
  sampleSpectrumRange,
  updateAdaptiveTriggerState,
} from "./audioRoutingLogic"
import type {
  AdaptiveTriggerState,
  AudioLevelMotionState,
} from "./audioRoutingLogic"
import { useVisualizerSocket } from "../shared/useVisualizerSocket"

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

type AudioLevelMotionHistorySample = Pick<
  AudioLevelMotionState,
  | "fallAmount"
  | "fallRate"
  | "fastLevel"
  | "floor"
  | "level"
  | "normalizedLevel"
  | "peak"
  | "riseAmount"
  | "riseRate"
  | "slowLevel"
  | "timestamp"
>

const levelMotionHistoryDurationMs = 3600
const levelMotionOptions = {
  fastSpeed: 0.48,
  slowSpeed: 0.07,
  floorRiseSpeed: 0.018,
  peakFallSpeed: 0.026,
  minRange: 0.08,
  rateScale: 5,
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
  circleGrowOnRise: false,
  circleFadeOnFall: false,
  circleShrinkOnFall: false,
  circleLevelControlsSize: false,
}

function getSelectedSpectrumRange(
  spectrum: number[],
  startPercent: number,
  endPercent: number,
) {
  if (spectrum.length === 0) {
    return []
  }

  const start = clamp(Math.min(startPercent, endPercent), 0, 100) / 100
  const end = clamp(Math.max(startPercent, endPercent), 0, 100) / 100
  const startIndex = Math.floor(start * spectrum.length)
  const endIndex = Math.max(startIndex + 1, Math.ceil(end * spectrum.length))

  return spectrum.slice(startIndex, Math.min(endIndex, spectrum.length))
}

function drawTrace({
  context,
  getValue,
  height,
  history,
  now,
  strokeStyle,
  width,
  x,
  y,
  lineWidth,
}: {
  context: CanvasRenderingContext2D
  getValue(sample: AudioLevelMotionHistorySample): number
  height: number
  history: AudioLevelMotionHistorySample[]
  now: number
  strokeStyle: string
  width: number
  x: number
  y: number
  lineWidth: number
}) {
  if (history.length < 2) {
    return
  }

  const startTime = now - levelMotionHistoryDurationMs

  context.strokeStyle = strokeStyle
  context.lineWidth = lineWidth
  context.beginPath()

  history.forEach((sample, index) => {
    const sampleX =
      x +
      clamp((sample.timestamp - startTime) / levelMotionHistoryDurationMs, 0, 1) *
        width
    const sampleY = y + height - clamp(getValue(sample), 0, 1) * height

    if (index === 0) {
      context.moveTo(sampleX, sampleY)
      return
    }

    context.lineTo(sampleX, sampleY)
  })

  context.stroke()
}

function getMotionLabel(snapshot: AudioLevelMotionState | null) {
  if (!snapshot) {
    return "Waiting"
  }

  if (snapshot.riseRate > snapshot.fallRate && snapshot.riseRate > 0.04) {
    return "Rising"
  }

  if (snapshot.fallRate > snapshot.riseRate && snapshot.fallRate > 0.04) {
    return "Falling"
  }

  return "Level"
}

function getMotionDataState(snapshot: AudioLevelMotionState | null) {
  if (!snapshot) {
    return "waiting"
  }

  if (snapshot.riseRate > snapshot.fallRate && snapshot.riseRate > 0.04) {
    return "rising"
  }

  if (snapshot.fallRate > snapshot.riseRate && snapshot.fallRate > 0.04) {
    return "falling"
  }

  return "level"
}

function getMotionFillColor(sample: AudioLevelMotionHistorySample) {
  if (sample.riseRate > sample.fallRate && sample.riseRate > 0.02) {
    return `rgba(255, 225, 86, ${0.08 + sample.riseAmount * 0.2})`
  }

  if (sample.fallRate > sample.riseRate && sample.fallRate > 0.02) {
    return `rgba(255, 143, 60, ${0.08 + sample.fallAmount * 0.2})`
  }

  return "rgba(0, 209, 255, 0.07)"
}

function drawLevelMotionFollower({
  canvas,
  history,
  sampleEndPercent,
  sampleStartPercent,
  spectrum,
}: {
  canvas: HTMLCanvasElement | null
  history: AudioLevelMotionHistorySample[]
  sampleEndPercent: number
  sampleStartPercent: number
  spectrum?: number[]
}) {
  if (!canvas) {
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
  context.fillStyle = "#0d0d11"
  context.fillRect(0, 0, width, height)

  const padding = 14
  const spectrumTop = 8
  const spectrumHeight = 34
  const graphX = padding
  const graphY = 56
  const graphWidth = Math.max(width - padding * 2, 1)
  const graphHeight = Math.max(height - graphY - 16, 1)
  const selectedSpectrum = getSelectedSpectrumRange(
    spectrum ?? [],
    sampleStartPercent,
    sampleEndPercent,
  )

  context.fillStyle = "rgba(255, 255, 255, 0.05)"
  context.fillRect(graphX, spectrumTop, graphWidth, spectrumHeight)

  if (selectedSpectrum.length > 0) {
    const gap = 2
    const barWidth = Math.max(
      2,
      (graphWidth - gap * Math.max(selectedSpectrum.length - 1, 0)) /
        selectedSpectrum.length,
    )

    selectedSpectrum.forEach((value, index) => {
      const x = graphX + index * (barWidth + gap)
      const barHeight = Math.max(2, value * spectrumHeight)
      const hue = 190 + index / Math.max(selectedSpectrum.length - 1, 1) * 90

      context.fillStyle = `hsl(${hue}, 94%, ${42 + value * 32}%)`
      context.fillRect(
        x,
        spectrumTop + spectrumHeight - barHeight,
        barWidth,
        barHeight,
      )
    })
  } else {
    context.fillStyle = "rgba(247, 247, 255, 0.5)"
    context.font = "700 12px sans-serif"
    context.fillText("Waiting for selected range", graphX, spectrumTop + 22)
  }

  context.strokeStyle = "rgba(247, 247, 255, 0.18)"
  context.lineWidth = 1
  context.strokeRect(graphX, spectrumTop, graphWidth, spectrumHeight)

  context.fillStyle = "rgba(255, 255, 255, 0.035)"
  context.fillRect(graphX, graphY, graphWidth, graphHeight)

  const now = history.at(-1)?.timestamp ?? Date.now()
  const startTime = now - levelMotionHistoryDurationMs

  history.forEach((sample, index) => {
    const nextSample = history[index + 1]
    const sampleX =
      graphX +
      clamp((sample.timestamp - startTime) / levelMotionHistoryDurationMs, 0, 1) *
        graphWidth
    const nextX = nextSample
      ? graphX +
        clamp(
          (nextSample.timestamp - startTime) / levelMotionHistoryDurationMs,
          0,
          1,
        ) *
          graphWidth
      : graphX + graphWidth

    context.fillStyle = getMotionFillColor(sample)
    context.fillRect(sampleX, graphY, Math.max(nextX - sampleX, 1), graphHeight)
  })

  drawTrace({
    context,
    getValue: (sample) => sample.peak,
    height: graphHeight,
    history,
    now,
    strokeStyle: "rgba(60, 255, 158, 0.36)",
    width: graphWidth,
    x: graphX,
    y: graphY,
    lineWidth: 1,
  })
  drawTrace({
    context,
    getValue: (sample) => sample.floor,
    height: graphHeight,
    history,
    now,
    strokeStyle: "rgba(255, 45, 117, 0.32)",
    width: graphWidth,
    x: graphX,
    y: graphY,
    lineWidth: 1,
  })
  drawTrace({
    context,
    getValue: (sample) => sample.slowLevel,
    height: graphHeight,
    history,
    now,
    strokeStyle: "rgba(255, 143, 60, 0.72)",
    width: graphWidth,
    x: graphX,
    y: graphY,
    lineWidth: 2,
  })
  drawTrace({
    context,
    getValue: (sample) => sample.level,
    height: graphHeight,
    history,
    now,
    strokeStyle: "rgba(0, 209, 255, 0.42)",
    width: graphWidth,
    x: graphX,
    y: graphY,
    lineWidth: 1,
  })
  drawTrace({
    context,
    getValue: (sample) => sample.fastLevel,
    height: graphHeight,
    history,
    now,
    strokeStyle: "#f7f7ff",
    width: graphWidth,
    x: graphX,
    y: graphY,
    lineWidth: 2,
  })

  const latest = history.at(-1)

  if (latest) {
    const latestY = graphY + graphHeight - latest.fastLevel * graphHeight

    context.fillStyle =
      latest.fallRate > latest.riseRate ? "#ff8f3c" : "#ffe156"
    context.beginPath()
    context.arc(graphX + graphWidth, latestY, 4, 0, Math.PI * 2)
    context.fill()
  }

  context.strokeStyle = "rgba(247, 247, 255, 0.18)"
  context.lineWidth = 1
  context.strokeRect(graphX, graphY, graphWidth, graphHeight)
}

function drawAudioSpectrum({
  adaptiveTriggerState,
  audioInstanceId,
  canvas,
  frame,
  settings,
}: {
  adaptiveTriggerState: AdaptiveTriggerState | null
  audioInstanceId: string
  canvas: HTMLCanvasElement | null
  frame: AudioAnalysisFrame
  settings: AudioCircleSettings
}) {
  const spectrum = frame.spectrum

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
  const routeSignal = frame.routes?.find(
    (route) => route.audioInstanceId === audioInstanceId,
  )
  const rawSample = sampleSpectrumRange(
    spectrum,
    settings.sampleStartPercent,
    settings.sampleEndPercent,
  )
  const signalValue = routeSignal?.level ?? clamp(rawSample * settings.gain, 0, 1)
  const effectiveTriggerLevel =
    settings.triggerMode === "adaptive" && adaptiveTriggerState
      ? adaptiveTriggerState.triggerLevel
      : settings.triggerLevel
  const isTriggered =
    routeSignal?.triggered ?? isAboveTriggerLevel(signalValue, effectiveTriggerLevel)
  const visualRangeWidth = Math.max((rangeEnd - rangeStart) * width, 2)
  const rangeX = clamp(rangeStart * width, 0, Math.max(width - visualRangeWidth, 0))

  context.fillStyle = isTriggered
    ? "rgba(255, 225, 86, 0.16)"
    : "rgba(0, 209, 255, 0.12)"
  context.fillRect(rangeX, 0, visualRangeWidth, height)

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
}

function createLevelMotionStateFromRouteSignal(
  routeSignal: NonNullable<AudioAnalysisFrame["routes"]>[number],
  timestamp: number,
): AudioLevelMotionState {
  const range = Math.max(routeSignal.peak - routeSignal.floor, 0.08)

  return {
    level: routeSignal.level,
    fastLevel: routeSignal.fastLevel,
    slowLevel: routeSignal.slowLevel,
    floor: routeSignal.floor,
    peak: routeSignal.peak,
    range,
    normalizedLevel:
      routeSignal.peak > routeSignal.floor
        ? clamp((routeSignal.fastLevel - routeSignal.floor) / range, 0, 1)
        : 0,
    delta: 0,
    riseRate: routeSignal.riseRate,
    fallRate: routeSignal.fallRate,
    riseAmount: routeSignal.riseAmount,
    fallAmount: routeSignal.fallAmount,
    timestamp,
  }
}

function createLevelMotionHistorySample(
  state: AudioLevelMotionState,
): AudioLevelMotionHistorySample {
  return {
    fallAmount: state.fallAmount,
    fallRate: state.fallRate,
    fastLevel: state.fastLevel,
    floor: state.floor,
    level: state.level,
    normalizedLevel: state.normalizedLevel,
    peak: state.peak,
    riseAmount: state.riseAmount,
    riseRate: state.riseRate,
    slowLevel: state.slowLevel,
    timestamp: state.timestamp,
  }
}

type AudioControllerViewProps = {
  audioInstanceId: string
}

export function AudioControllerView({ audioInstanceId }: AudioControllerViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const levelMotionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const adaptiveTriggerRef = useRef<AdaptiveTriggerState | null>(null)
  const levelMotionStateRef = useRef<AudioLevelMotionState | null>(null)
  const levelMotionHistoryRef = useRef<AudioLevelMotionHistorySample[]>([])
  const lastControllerStateUpdateAtRef = useRef(0)
  const [settings, setSettings] =
    useState<AudioCircleSettings>(defaultAudioSettings)
  const [adaptiveTriggerState, setAdaptiveTriggerState] =
    useState<AdaptiveTriggerState | null>(null)
  const [levelMotionSnapshot, setLevelMotionSnapshot] =
    useState<AudioLevelMotionState | null>(null)
  const [rawSampleValue, setRawSampleValue] = useState(0)
  const [sampleValue, setSampleValue] = useState(0)
  const displayedTriggerLevel =
    settings.triggerMode === "adaptive" && adaptiveTriggerState
      ? adaptiveTriggerState.triggerLevel
      : settings.triggerLevel

  const handleStageAudioFrame = useCallback(
    (frame: AudioAnalysisFrame) => {
      const spectrum = frame.spectrum

      if (!spectrum) {
        return
      }

      const routeSignal = frame.routes?.find(
        (route) => route.audioInstanceId === audioInstanceId,
      )
      const timestamp = frame.timestamp
      const nextRawSampleValue = sampleSpectrumRange(
        spectrum,
        settings.sampleStartPercent,
        settings.sampleEndPercent,
      )
      const nextSampleValue =
        routeSignal?.level ?? clamp(nextRawSampleValue * settings.gain, 0, 1)
      let nextAdaptiveTriggerState = adaptiveTriggerRef.current

      if (settings.triggerMode === "adaptive") {
        nextAdaptiveTriggerState = updateAdaptiveTriggerState(
          adaptiveTriggerRef.current,
          nextSampleValue,
          {
            sensitivity: settings.adaptiveSensitivity,
            adaptSpeed: settings.adaptiveSpeed,
          },
        )
        adaptiveTriggerRef.current = nextAdaptiveTriggerState
      } else {
        nextAdaptiveTriggerState = null
        adaptiveTriggerRef.current = null
      }

      drawAudioSpectrum({
        adaptiveTriggerState: nextAdaptiveTriggerState,
        audioInstanceId,
        canvas: canvasRef.current,
        frame,
        settings,
      })

      const nextLevelMotionState = routeSignal
        ? createLevelMotionStateFromRouteSignal(routeSignal, timestamp)
        : updateAudioLevelMotionState(
            levelMotionStateRef.current,
            nextSampleValue,
            timestamp,
            levelMotionOptions,
          )

      levelMotionStateRef.current = nextLevelMotionState

      const earliestTimestamp = timestamp - levelMotionHistoryDurationMs
      const nextHistory = [
        ...levelMotionHistoryRef.current,
        createLevelMotionHistorySample(nextLevelMotionState),
      ].filter((sample) => sample.timestamp >= earliestTimestamp)

      levelMotionHistoryRef.current = nextHistory
      drawLevelMotionFollower({
        canvas: levelMotionCanvasRef.current,
        history: nextHistory,
        sampleEndPercent: settings.sampleEndPercent,
        sampleStartPercent: settings.sampleStartPercent,
        spectrum,
      })

      const lastStateUpdateAt = lastControllerStateUpdateAtRef.current

      if (
        lastStateUpdateAt !== 0 &&
        timestamp >= lastStateUpdateAt &&
        timestamp - lastStateUpdateAt < 100
      ) {
        return
      }

      lastControllerStateUpdateAtRef.current = timestamp
      setRawSampleValue(nextRawSampleValue)
      setSampleValue(nextSampleValue)
      setAdaptiveTriggerState(nextAdaptiveTriggerState)
      setLevelMotionSnapshot(nextLevelMotionState)
    },
    [audioInstanceId, settings],
  )

  const socket = useVisualizerSocket("audio", {
    audioInstanceId,
    onStageAudioFrame: handleStageAudioFrame,
  })
  const stageAudioFrame = socket.stageAudioFrame

  useEffect(() => {
    if (socket.audioSettings) {
      setSettings(socket.audioSettings)
    }
  }, [socket.audioSettings])

  useEffect(() => {
    adaptiveTriggerRef.current = null
    setAdaptiveTriggerState(null)
    lastControllerStateUpdateAtRef.current = 0
  }, [
    audioInstanceId,
    settings.adaptiveSpeed,
    settings.adaptiveSensitivity,
    settings.gain,
    settings.sampleEndPercent,
    settings.sampleStartPercent,
    settings.triggerMode,
  ])

  useEffect(() => {
    levelMotionStateRef.current = null
    levelMotionHistoryRef.current = []
    setLevelMotionSnapshot(null)
    lastControllerStateUpdateAtRef.current = 0
  }, [
    audioInstanceId,
    settings.gain,
    settings.sampleEndPercent,
    settings.sampleStartPercent,
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
          audioInstanceId,
          settings: nextSettings,
          timestamp: Date.now(),
        }),
      )

      return nextSettings
    })
  }

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

      <section className="audio-pulse-panel" aria-label="Triggered circle behavior">
        <header>
          <p className="eyebrow">Triggered Circles</p>
          <h2>Rise/Fall Pulse</h2>
        </header>
        <label className="audio-checkbox-field">
          <input
            type="checkbox"
            checked={settings.circleGrowOnRise}
            onChange={(event) =>
              updateSettings({ circleGrowOnRise: event.currentTarget.checked })
            }
          />
          <span>Grow on rise</span>
        </label>
        <label className="audio-checkbox-field">
          <input
            type="checkbox"
            checked={settings.circleFadeOnFall}
            onChange={(event) =>
              updateSettings({ circleFadeOnFall: event.currentTarget.checked })
            }
          />
          <span>Fade on fall</span>
        </label>
        <label className="audio-checkbox-field">
          <input
            type="checkbox"
            checked={settings.circleShrinkOnFall}
            onChange={(event) =>
              updateSettings({ circleShrinkOnFall: event.currentTarget.checked })
            }
          />
          <span>Shrink on fall</span>
        </label>
        <label className="audio-checkbox-field">
          <input
            type="checkbox"
            checked={settings.circleLevelControlsSize}
            onChange={(event) =>
              updateSettings({
                circleLevelControlsSize: event.currentTarget.checked,
              })
            }
          />
          <span>Level sets size</span>
        </label>
      </section>

      {!stageAudioFrame ? (
        <p className="audio-error">Start audio on the stage screen.</p>
      ) : null}

      <section className="audio-motion-panel" aria-label="Level motion follower">
        <header className="audio-motion-header">
          <div className="audio-motion-header-row">
            <div>
              <p className="eyebrow">Level Motion</p>
              <h2>
                Range {Math.min(settings.sampleStartPercent, settings.sampleEndPercent)}
                -
                {Math.max(settings.sampleStartPercent, settings.sampleEndPercent)}%
              </h2>
            </div>
            <div
              className="audio-motion-state"
              data-motion={getMotionDataState(levelMotionSnapshot)}
            >
              {getMotionLabel(levelMotionSnapshot)}
            </div>
          </div>
          <div className="audio-motion-key" aria-label="Graph key">
            <span>
              <i data-line="fast" />
              <b>Fast avg</b>
              <strong>{formatPercent(levelMotionSnapshot?.fastLevel)}</strong>
            </span>
            <span>
              <i data-line="raw" />
              <b>Raw level</b>
              <strong>{formatPercent(levelMotionSnapshot?.level)}</strong>
            </span>
            <span>
              <i data-line="slow" />
              <b>Slow avg</b>
              <strong>{formatPercent(levelMotionSnapshot?.slowLevel)}</strong>
            </span>
            <span>
              <i data-line="peak" />
              <b>Recent high</b>
              <strong>{formatPercent(levelMotionSnapshot?.peak)}</strong>
            </span>
            <span>
              <i data-line="floor" />
              <b>Recent low</b>
              <strong>{formatPercent(levelMotionSnapshot?.floor)}</strong>
            </span>
          </div>
        </header>
        <canvas
          ref={levelMotionCanvasRef}
          className="audio-motion-canvas"
          aria-label="Selected range level motion trace"
        />
        <div className="audio-motion-meters">
          <div
            className="audio-motion-meter"
            data-kind="level"
            data-tooltip="Current average energy in the selected frequency range after gain."
            tabIndex={0}
          >
            <span>Level</span>
            <div>
              <i style={{ width: formatPercent(levelMotionSnapshot?.level) }} />
            </div>
            <strong>{formatPercent(levelMotionSnapshot?.level)}</strong>
          </div>
          <div
            className="audio-motion-meter"
            data-kind="rise"
            data-tooltip="Upward motion amount: fast average above slow average, blended with the current up rate."
            tabIndex={0}
          >
            <span>Rise</span>
            <div>
              <i style={{ width: formatPercent(levelMotionSnapshot?.riseAmount) }} />
            </div>
            <strong>{formatPercent(levelMotionSnapshot?.riseAmount)}</strong>
          </div>
          <div
            className="audio-motion-meter"
            data-kind="fall"
            data-tooltip="Downward motion amount: slow average above fast average, blended with the current down rate."
            tabIndex={0}
          >
            <span>Fall</span>
            <div>
              <i style={{ width: formatPercent(levelMotionSnapshot?.fallAmount) }} />
            </div>
            <strong>{formatPercent(levelMotionSnapshot?.fallAmount)}</strong>
          </div>
          <div
            className="audio-motion-meter"
            data-kind="rise-rate"
            data-tooltip="How quickly the selected range is rising right now, normalized against the recent high-low range."
            tabIndex={0}
          >
            <span>Up Rate</span>
            <div>
              <i style={{ width: formatPercent(levelMotionSnapshot?.riseRate) }} />
            </div>
            <strong>{formatPercent(levelMotionSnapshot?.riseRate)}</strong>
          </div>
          <div
            className="audio-motion-meter"
            data-kind="fall-rate"
            data-tooltip="How quickly the selected range is falling right now, normalized against the recent high-low range."
            tabIndex={0}
          >
            <span>Dn Rate</span>
            <div>
              <i style={{ width: formatPercent(levelMotionSnapshot?.fallRate) }} />
            </div>
            <strong>{formatPercent(levelMotionSnapshot?.fallRate)}</strong>
          </div>
        </div>
      </section>
    </main>
  )
}
