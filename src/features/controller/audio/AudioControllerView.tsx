"use client"

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  createAudioSettingsDeleteMessage,
  createAudioSettingsUpdateMessage,
} from "@/features/network/protocol"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
} from "@/features/network/protocolTypes"
import { ColorPicker } from "../shared/ColorPicker"
import { ControlSlider } from "../shared/ControlSlider"
import { ControllerNav } from "../shared/ControllerNav"
import type {
  AudioControlledShapeSettings,
  ShapeControlName,
  ShapeFamily,
  ShapeMotionMode,
  ShapeMotionSource,
  ShapePositionMode,
  ShapeSpiralMotionDirection,
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "@/features/shapeGenerator/shapeGeneratorTypes"
import {
  createDefaultAudioControlledShapeSettings,
  shapeFamilyOptions,
  shapeControlNames,
} from "@/features/shapeGenerator/shapeGeneratorTypes"
import { getNearestPolyhedronSideCount } from "@/features/shapeGenerator/shapeGeneratorThree"
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
import {
  VisualCvPreviewPanel,
  type VisualCvPreviewPanelHandle,
} from "./VisualCvPreviewPanel"
import {
  defaultTriggeredCircleRouting,
  defaultVisualCvSettings,
} from "@/features/visualCv/visualCvDefaults"
import type {
  TriggeredCircleVisualCvRouting,
  VisualCvModulationSource,
  VisualCvSettings,
  VisualCvTriggerSource,
} from "@/features/visualCv/visualCvTypes"
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
  triggeredCircles: defaultTriggeredCircleRouting,
  visualCv: defaultVisualCvSettings,
  centerShape: createDefaultAudioControlledShapeSettings(),
}

type ShapeControlDefinition = {
  name: ShapeControlName
  label: string
  min: number
  max: number
  step: number
  motionAmountMax: number
  motionAmountStep: number
}

const shapeControlDefinitions: ShapeControlDefinition[] = [
  {
    name: "sides",
    label: "Sides",
    min: 3,
    max: 24,
    step: 1,
    motionAmountMax: 12,
    motionAmountStep: 1,
  },
  {
    name: "size",
    label: "Size",
    min: 0.7,
    max: 2.6,
    step: 0.1,
    motionAmountMax: 1.5,
    motionAmountStep: 0.05,
  },
  {
    name: "rotationX",
    label: "Rotate X",
    min: -180,
    max: 180,
    step: 1,
    motionAmountMax: 180,
    motionAmountStep: 1,
  },
  {
    name: "rotationY",
    label: "Rotate Y",
    min: -180,
    max: 180,
    step: 1,
    motionAmountMax: 180,
    motionAmountStep: 1,
  },
  {
    name: "rotationZ",
    label: "Rotate Z",
    min: -180,
    max: 180,
    step: 1,
    motionAmountMax: 180,
    motionAmountStep: 1,
  },
  {
    name: "positionX",
    label: "Position X",
    min: -1.5,
    max: 1.5,
    step: 0.01,
    motionAmountMax: 1.5,
    motionAmountStep: 0.01,
  },
  {
    name: "positionY",
    label: "Position Y",
    min: -1,
    max: 1,
    step: 0.01,
    motionAmountMax: 1,
    motionAmountStep: 0.01,
  },
  {
    name: "positionZ",
    label: "Position Z",
    min: -2,
    max: 2,
    step: 0.01,
    motionAmountMax: 2,
    motionAmountStep: 0.01,
  },
  {
    name: "angleBias",
    label: "Angle Bias",
    min: -1,
    max: 1,
    step: 0.01,
    motionAmountMax: 1,
    motionAmountStep: 0.01,
  },
  {
    name: "sideVariation",
    label: "Side Variation",
    min: 0,
    max: 1,
    step: 0.01,
    motionAmountMax: 1,
    motionAmountStep: 0.01,
  },
  {
    name: "depth",
    label: "Depth",
    min: 0.2,
    max: 3,
    step: 0.1,
    motionAmountMax: 2,
    motionAmountStep: 0.05,
  },
  {
    name: "bevel",
    label: "Bevel",
    min: 0,
    max: 0.25,
    step: 0.01,
    motionAmountMax: 0.2,
    motionAmountStep: 0.01,
  },
  {
    name: "twist",
    label: "Twist",
    min: -180,
    max: 180,
    step: 1,
    motionAmountMax: 180,
    motionAmountStep: 1,
  },
  {
    name: "taper",
    label: "Taper",
    min: 0.2,
    max: 1.8,
    step: 0.05,
    motionAmountMax: 1,
    motionAmountStep: 0.05,
  },
]

const colorMotionDefinition = {
  name: "colorHue" as const,
  label: "Hue Amount",
  motionAmountMax: 360,
  motionAmountStep: 1,
}

const continuousShapeControlNames: ShapeControlName[] = [
  "positionX",
  "positionY",
  "positionZ",
  "rotationX",
  "rotationY",
  "rotationZ",
]

const positionShapeControlNames: ShapeControlName[] = [
  "positionX",
  "positionY",
  "positionZ",
]

type ResetCycleName = ShapeControlName | "spiral"

const shapeMotionModeOptions: Array<{
  value: ShapeMotionMode
  label: string
}> = [
  { value: "oscillate", label: "Oscillate" },
  { value: "continuous", label: "Continuous" },
]

const shapePositionModeOptions: Array<{
  value: ShapePositionMode
  label: string
}> = [
  { value: "manual", label: "Manual" },
  { value: "spiral", label: "Spiral" },
]

const shapeSpiralDirectionOptions: Array<{
  value: ShapeSpiralMotionDirection
  label: string
}> = [
  { value: "clockwise", label: "Clockwise" },
  { value: "counterclockwise", label: "Counter" },
]

const triggeredCircleTriggerSourceOptions: Array<{
  value: VisualCvTriggerSource
  label: string
}> = [
  { value: "range", label: "Range Trigger" },
  { value: "envelope", label: "Envelope Trigger" },
  { value: "syncSine", label: "Sync Trigger" },
]

const visualCvModulationSourceOptions: Array<{
  value: VisualCvModulationSource
  label: string
}> = [
  { value: "level", label: "Level" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
  { value: "motion", label: "Motion" },
  { value: "smooth", label: "Smooth" },
  { value: "envelope", label: "Envelope" },
  { value: "syncSine", label: "Sync Sine" },
]

const shapeMotionSourceOptions: Array<{
  value: ShapeMotionSource
  label: string
}> = [
  { value: "level", label: "Level" },
  { value: "rise-fall", label: "Rise/Fall" },
  { value: "motion", label: "Motion" },
  { value: "smooth", label: "Smooth" },
  { value: "envelope", label: "Envelope" },
  { value: "syncSine", label: "Sync Sine" },
]

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

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getShapeVector3Value(
  value: unknown,
  fallback: ShapeVector3,
): ShapeVector3 {
  if (!isRecordValue(value)) {
    return fallback
  }

  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y,
    z: typeof value.z === "number" && Number.isFinite(value.z) ? value.z : fallback.z,
  }
}

function isVisualCvModulationSourceValue(
  value: unknown,
): value is VisualCvModulationSource {
  return visualCvModulationSourceOptions.some((option) => option.value === value)
}

function normalizeSpiralMotionSettings(
  value: unknown,
  fallback: ShapeSpiralMotionSettings,
): ShapeSpiralMotionSettings {
  if (!isRecordValue(value)) {
    return fallback
  }

  return {
    enabled:
      typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    visualize:
      typeof value.visualize === "boolean"
        ? value.visualize
        : fallback.visualize,
    startRadius:
      typeof value.startRadius === "number" && Number.isFinite(value.startRadius)
        ? Math.max(value.startRadius, 0)
        : fallback.startRadius,
    radiusSource: isVisualCvModulationSourceValue(value.radiusSource)
      ? value.radiusSource
      : fallback.radiusSource,
    radiusCvAmount:
      typeof value.radiusCvAmount === "number" &&
      Number.isFinite(value.radiusCvAmount)
        ? Math.max(value.radiusCvAmount, 0)
        : fallback.radiusCvAmount,
    degreesPerPulse:
      typeof value.degreesPerPulse === "number" &&
      Number.isFinite(value.degreesPerPulse)
        ? Math.max(value.degreesPerPulse, 0)
        : fallback.degreesPerPulse,
    depthPerPulse:
      typeof value.depthPerPulse === "number" &&
      Number.isFinite(value.depthPerPulse)
        ? Math.max(value.depthPerPulse, 0)
        : fallback.depthPerPulse,
    resetMs:
      typeof value.resetMs === "number" && Number.isFinite(value.resetMs)
        ? Math.max(value.resetMs, 250)
        : fallback.resetMs,
    direction:
      value.direction === "clockwise" || value.direction === "counterclockwise"
        ? value.direction
        : fallback.direction,
    startPhaseDegrees:
      typeof value.startPhaseDegrees === "number" &&
      Number.isFinite(value.startPhaseDegrees)
        ? value.startPhaseDegrees
        : fallback.startPhaseDegrees,
  }
}

function normalizeCenterShapeSettings(
  value: AudioControlledShapeSettings | null | undefined,
): AudioControlledShapeSettings {
  const defaults = createDefaultAudioControlledShapeSettings()

  if (!value) {
    return defaults
  }

  const rawValue = value as Partial<AudioControlledShapeSettings> & {
    rotation?: unknown
    position?: unknown
    positionMode?: unknown
    spiralMotion?: unknown
  }
  const legacyRotation =
    typeof rawValue.rotation === "number" && Number.isFinite(rawValue.rotation)
      ? rawValue.rotation
      : null
  const rotation =
    legacyRotation === null
      ? getShapeVector3Value(rawValue.rotation, defaults.rotation)
      : {
          ...defaults.rotation,
          [rawValue.mode === "3d" ? "y" : "z"]: legacyRotation,
        }
  const motionMappings = shapeControlNames.reduce((mappings, controlName) => {
    mappings[controlName] = {
      ...defaults.motionMappings[controlName],
      ...value.motionMappings?.[controlName],
    }

    return mappings
  }, {} as AudioControlledShapeSettings["motionMappings"])

  return {
    ...defaults,
    ...value,
    color: typeof value.color === "string" ? value.color : defaults.color,
    parameters: {
      ...defaults.parameters,
      ...value.parameters,
    },
    position: getShapeVector3Value(rawValue.position, defaults.position),
    positionMode:
      rawValue.positionMode === "spiral" ? "spiral" : defaults.positionMode,
    rotation,
    spiralMotion: normalizeSpiralMotionSettings(
      rawValue.spiralMotion,
      defaults.spiralMotion,
    ),
    motionMappings,
  }
}

function getShapeControlValue(
  shape: AudioControlledShapeSettings,
  controlName: ShapeControlName,
) {
  switch (controlName) {
    case "colorHue":
      return 0
    case "positionX":
      return shape.position.x
    case "positionY":
      return shape.position.y
    case "positionZ":
      return shape.position.z
    case "rotationX":
      return shape.rotation.x
    case "rotationY":
      return shape.rotation.y
    case "rotationZ":
      return shape.rotation.z
    default:
      return shape.parameters[controlName]
  }
}

function formatShapeControlValue(value: number, step: number) {
  if (step >= 1) {
    return String(Math.round(value))
  }

  return String(Number(value.toFixed(2)))
}

function formatMilliseconds(value: number) {
  return `${Number((value / 1000).toFixed(2))}s`
}

function formatResetSecondsInput(value: number) {
  return Number((value / 1000).toFixed(3))
}

function getResetProgress({
  now,
  resetMs,
  startedAt,
}: {
  now: number
  resetMs: number
  startedAt: number
}) {
  const duration = Math.max(resetMs, 1)

  return ((Math.max(now - startedAt, 0) % duration) / duration)
}

function supportsContinuousShapeMotion(controlName: ShapeControlName) {
  return continuousShapeControlNames.includes(controlName)
}

function isPositionShapeControl(controlName: ShapeControlName) {
  return positionShapeControlNames.includes(controlName)
}

function formatAudioFrameSource(frame: AudioAnalysisFrame | null) {
  if (!frame) {
    return "None"
  }

  if (frame.source === "song") {
    return "Song"
  }

  return "Stage"
}

type AudioControllerViewProps = {
  audioInstanceId: string
}

export function AudioControllerView({ audioInstanceId }: AudioControllerViewProps) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const levelMotionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const adaptiveTriggerRef = useRef<AdaptiveTriggerState | null>(null)
  const levelMotionStateRef = useRef<AudioLevelMotionState | null>(null)
  const levelMotionHistoryRef = useRef<AudioLevelMotionHistorySample[]>([])
  const visualCvPreviewRef = useRef<VisualCvPreviewPanelHandle | null>(null)
  const lastControllerStateUpdateAtRef = useRef(0)
  const resetCycleStartsRef = useRef<Partial<Record<ResetCycleName, number>>>(
    {},
  )
  const [settings, setSettings] =
    useState<AudioCircleSettings>(defaultAudioSettings)
  const [adaptiveTriggerState, setAdaptiveTriggerState] =
    useState<AdaptiveTriggerState | null>(null)
  const [levelMotionSnapshot, setLevelMotionSnapshot] =
    useState<AudioLevelMotionState | null>(null)
  const [rawSampleValue, setRawSampleValue] = useState(0)
  const [sampleValue, setSampleValue] = useState(0)
  const [pendingDeletedAudioInstanceId, setPendingDeletedAudioInstanceId] =
    useState<string | null>(null)
  const [resetProgressNow, setResetProgressNow] = useState(() => Date.now())
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
      visualCvPreviewRef.current?.receiveInput({
        timestamp: nextLevelMotionState.timestamp,
        level: nextLevelMotionState.level,
        riseAmount: nextLevelMotionState.riseAmount,
        fallAmount: nextLevelMotionState.fallAmount,
        riseRate: nextLevelMotionState.riseRate,
        fallRate: nextLevelMotionState.fallRate,
      })

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
  const audioInstances = socket.audioInstances
  const selectedInstanceExists = audioInstances.some(
    (instance) => instance.audioInstanceId === audioInstanceId,
  )

  useEffect(() => {
    if (socket.audioSettings) {
      setSettings({
        ...defaultAudioSettings,
        ...socket.audioSettings,
        triggeredCircles:
          socket.audioSettings.triggeredCircles ??
          defaultAudioSettings.triggeredCircles,
        visualCv: socket.audioSettings.visualCv ?? defaultAudioSettings.visualCv,
        centerShape: normalizeCenterShapeSettings(
          socket.audioSettings.centerShape,
        ),
      })
    }
  }, [socket.audioSettings])

  useEffect(() => {
    if (pendingDeletedAudioInstanceId !== audioInstanceId) {
      return
    }

    const stillExists = audioInstances.some(
      (instance) => instance.audioInstanceId === pendingDeletedAudioInstanceId,
    )

    if (stillExists) {
      return
    }

    const nextAudioInstance = audioInstances.find(
      (instance) => instance.audioInstanceId !== pendingDeletedAudioInstanceId,
    )

    setPendingDeletedAudioInstanceId(null)

    if (nextAudioInstance) {
      router.replace(`/audio-controller/${nextAudioInstance.audioInstanceId}`)
      return
    }

    router.replace("/audio-controller")
  }, [
    audioInstanceId,
    audioInstances,
    pendingDeletedAudioInstanceId,
    router,
  ])

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

  useEffect(() => {
    const now = Date.now()
    const activePositionControls = positionShapeControlNames.filter(
      (controlName) => {
        const mapping = settings.centerShape.motionMappings[controlName]

        return mapping.enabled && mapping.mode === "continuous"
      },
    )
    const activeResetControls: ResetCycleName[] = [...activePositionControls]

    if (
      settings.centerShape.positionMode === "spiral" &&
      settings.centerShape.spiralMotion.enabled
    ) {
      activeResetControls.push("spiral")
    }

    activeResetControls.forEach((controlName) => {
      resetCycleStartsRef.current[controlName] ??= now
    })

    Object.keys(resetCycleStartsRef.current).forEach((controlName) => {
      if (!activeResetControls.includes(controlName as ResetCycleName)) {
        delete resetCycleStartsRef.current[controlName as ResetCycleName]
      }
    })

    if (activeResetControls.length === 0) {
      return
    }

    setResetProgressNow(now)

    const interval = window.setInterval(() => {
      setResetProgressNow(Date.now())
    }, 100)

    return () => window.clearInterval(interval)
  }, [
    settings.centerShape.motionMappings,
    settings.centerShape.positionMode,
    settings.centerShape.spiralMotion.enabled,
    settings.centerShape.spiralMotion.resetMs,
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

  function updateVisualCv(visualCv: VisualCvSettings) {
    updateSettings({ visualCv })
  }

  function updateTriggeredCircles(
    patch: Partial<TriggeredCircleVisualCvRouting>,
  ) {
    updateSettings({
      triggeredCircles: {
        ...settings.triggeredCircles,
        ...patch,
      },
    })
  }

  function deleteCurrentAudioController() {
    const confirmed = window.confirm(`Delete audio controller "${audioInstanceId}"?`)

    if (!confirmed) {
      return
    }

    socket.sendAudioSettingsDelete(
      createAudioSettingsDeleteMessage({
        type: "audio_settings_delete",
        audioInstanceId,
        timestamp: Date.now(),
      }),
    )
    setPendingDeletedAudioInstanceId(audioInstanceId)
  }

  function updateCenterShape(patch: Partial<AudioControlledShapeSettings>) {
    updateSettings({
      centerShape: {
        ...settings.centerShape,
        ...patch,
      },
    })
  }

  function updateShapeParameter(
    controlName: ShapeControlName,
    value: number,
  ) {
    if (controlName === "rotationX") {
      updateCenterShape({
        rotation: { ...settings.centerShape.rotation, x: value },
      })
      return
    }

    if (controlName === "rotationY") {
      updateCenterShape({
        rotation: { ...settings.centerShape.rotation, y: value },
      })
      return
    }

    if (controlName === "rotationZ") {
      updateCenterShape({
        rotation: { ...settings.centerShape.rotation, z: value },
      })
      return
    }

    if (controlName === "positionX") {
      updateCenterShape({
        position: { ...settings.centerShape.position, x: value },
      })
      return
    }

    if (controlName === "positionY") {
      updateCenterShape({
        position: { ...settings.centerShape.position, y: value },
      })
      return
    }

    if (controlName === "positionZ") {
      updateCenterShape({
        position: { ...settings.centerShape.position, z: value },
      })
      return
    }

    if (controlName === "colorHue") {
      return
    }

    updateCenterShape({
      parameters: {
        ...settings.centerShape.parameters,
        [controlName]: value,
      },
    })
  }

  function updateShapeMotionMapping(
    controlName: ShapeControlName,
    patch: Partial<AudioControlledShapeSettings["motionMappings"][ShapeControlName]>,
  ) {
    updateCenterShape({
      motionMappings: {
        ...settings.centerShape.motionMappings,
        [controlName]: {
          ...settings.centerShape.motionMappings[controlName],
          ...patch,
        },
      },
    })
  }

  function updateCenterShapeSpiralMotion(
    patch: Partial<ShapeSpiralMotionSettings>,
  ) {
    updateCenterShape({
      spiralMotion: {
        ...settings.centerShape.spiralMotion,
        ...patch,
      },
    })
  }

  function getVisibleShapeControls() {
    const shape = settings.centerShape
    const isPolygonal3D =
      shape.mode === "3d" &&
      (shape.family === "prism" || shape.family === "pyramid")
    const isSphere = shape.mode === "3d" && shape.family === "sphere"
    const isPolyhedron = shape.mode === "3d" && shape.family === "polyhedron"
    const showSides =
      shape.mode === "2d" || isPolygonal3D || isSphere || isPolyhedron
    const showAngleBias = shape.mode === "2d" || isPolygonal3D
    const showSideVariation =
      shape.mode === "2d" || isPolygonal3D || isSphere
    const showBevel = shape.mode === "3d" && shape.family === "prism"
    const showTwistAndTaper =
      shape.mode === "3d" && shape.family !== "pyramid"

    return shapeControlDefinitions
      .filter((definition) => {
        if (definition.name === "sides") {
          return showSides
        }

        if (definition.name === "angleBias") {
          return showAngleBias
        }

        if (definition.name === "sideVariation") {
          return showSideVariation
        }

        if (definition.name === "depth") {
          return shape.mode === "3d"
        }

        if (definition.name === "bevel") {
          return showBevel
        }

        if (definition.name === "twist" || definition.name === "taper") {
          return showTwistAndTaper
        }

        return true
      })
      .map((definition) => {
        if (definition.name !== "sides" || !isPolyhedron) {
          return definition
        }

        return {
          ...definition,
          label: "Sides",
          min: 4,
          max: 20,
        }
      })
  }

  const centerShape = settings.centerShape
  const visibleShapeControls = getVisibleShapeControls()
  const colorMotionMapping = centerShape.motionMappings[colorMotionDefinition.name]
  const spiralResetStartedAt =
    resetCycleStartsRef.current.spiral ?? resetProgressNow
  const spiralResetProgress = getResetProgress({
    now: resetProgressNow,
    resetMs: centerShape.spiralMotion.resetMs,
    startedAt: spiralResetStartedAt,
  })

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

      <section className="audio-instance-panel">
        <label className="control-field">
          <span>
            Controller <strong>{audioInstanceId}</strong>
          </span>
          <select
            value={selectedInstanceExists ? audioInstanceId : ""}
            onChange={(event) => {
              const nextAudioInstanceId = event.currentTarget.value

              if (nextAudioInstanceId) {
                router.push(`/audio-controller/${nextAudioInstanceId}`)
              }
            }}
          >
            {!selectedInstanceExists ? (
              <option value="">{audioInstanceId}</option>
            ) : null}
            {audioInstances.map((instance) => (
              <option
                key={instance.audioInstanceId}
                value={instance.audioInstanceId}
              >
                {instance.audioInstanceId}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="audio-delete-button"
          disabled={pendingDeletedAudioInstanceId === audioInstanceId}
          onClick={deleteCurrentAudioController}
        >
          {pendingDeletedAudioInstanceId === audioInstanceId ? "Deleting" : "Delete"}
        </button>
      </section>

      <section className="audio-spectrum-panel">
        <canvas ref={canvasRef} className="audio-spectrum-canvas" />
      </section>

      <section className="audio-control-panel">
        <div className="audio-meter">
          <span>Source</span>
          <strong>{formatAudioFrameSource(stageAudioFrame)}</strong>
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

      <VisualCvPreviewPanel
        ref={visualCvPreviewRef}
        resetKey={[
          audioInstanceId,
          settings.gain,
          settings.sampleStartPercent,
          settings.sampleEndPercent,
        ].join(":")}
        settings={settings.visualCv}
        onSettingsChange={updateVisualCv}
      />

      <section className="audio-pulse-panel" aria-label="Triggered circle behavior">
        <header>
          <p className="eyebrow">Triggered Circles</p>
          <h2>CV Routed Pulse</h2>
        </header>
        <div className="audio-cv-routing-grid">
          <label className="control-field">
            <span>Trigger Source</span>
            <select
              value={settings.triggeredCircles.triggerSource}
              onChange={(event) =>
                updateTriggeredCircles({
                  triggerSource: event.currentTarget.value as VisualCvTriggerSource,
                })
              }
            >
              {triggeredCircleTriggerSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span>Size Source</span>
            <select
              value={settings.triggeredCircles.sizeSource}
              onChange={(event) =>
                updateTriggeredCircles({
                  sizeSource: event.currentTarget.value as VisualCvModulationSource,
                })
              }
            >
              {visualCvModulationSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span>Grow Source</span>
            <select
              value={settings.triggeredCircles.growSource}
              onChange={(event) =>
                updateTriggeredCircles({
                  growSource: event.currentTarget.value as VisualCvModulationSource,
                })
              }
            >
              {visualCvModulationSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="control-field">
            <span>Release Source</span>
            <select
              value={settings.triggeredCircles.releaseSource}
              onChange={(event) =>
                updateTriggeredCircles({
                  releaseSource:
                    event.currentTarget.value as VisualCvModulationSource,
                })
              }
            >
              {visualCvModulationSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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

      <section className="audio-shape-panel" aria-label="Center shape controls">
        <header className="audio-shape-header">
          <div>
            <p className="eyebrow">Center Shape</p>
            <h2>Stage Shape</h2>
          </div>
          <label className="audio-checkbox-field">
            <input
              type="checkbox"
              checked={centerShape.enabled}
              onChange={(event) =>
                updateCenterShape({ enabled: event.currentTarget.checked })
              }
            />
            <span>Show on stage</span>
          </label>
        </header>

        <div className="audio-shape-base-controls">
          <div
            className="mode-toggle"
            role="group"
            aria-label="Center shape dimension"
          >
            <button
              type="button"
              data-active={centerShape.mode === "2d"}
              aria-pressed={centerShape.mode === "2d"}
              onClick={() => updateCenterShape({ mode: "2d" })}
            >
              2D
            </button>
            <button
              type="button"
              data-active={centerShape.mode === "3d"}
              aria-pressed={centerShape.mode === "3d"}
              onClick={() => updateCenterShape({ mode: "3d" })}
            >
              3D
            </button>
          </div>

          {centerShape.mode === "3d" ? (
            <label className="control-field">
              <span>Form</span>
              <select
                value={centerShape.family}
                onChange={(event) =>
                  updateCenterShape({
                    family: event.target.value as ShapeFamily,
                  })
                }
              >
                {shapeFamilyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="control-field">
            <span>
              Position Mode
              <strong>
                {centerShape.positionMode === "spiral" ? "Spiral" : "Manual"}
              </strong>
            </span>
            <div
              className="mode-toggle"
              role="group"
              aria-label="Center shape position mode"
            >
              {shapePositionModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={centerShape.positionMode === option.value}
                  aria-pressed={centerShape.positionMode === option.value}
                  onClick={() => {
                    updateCenterShape(
                      option.value === "spiral"
                        ? {
                            positionMode: option.value,
                            spiralMotion: {
                              ...centerShape.spiralMotion,
                              enabled: true,
                            },
                          }
                        : { positionMode: option.value },
                    )
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="audio-shape-appearance-controls">
          <ColorPicker
            color={centerShape.color}
            onColorChange={(color) => updateCenterShape({ color })}
          />

          <div className="audio-shape-control">
            <label className="audio-shape-motion-toggle">
              <input
                type="checkbox"
                checked={colorMotionMapping.enabled}
                onChange={(event) =>
                  updateShapeMotionMapping(colorMotionDefinition.name, {
                    enabled: event.currentTarget.checked,
                  })
                }
              />
              <span>Use CV Color</span>
            </label>

            {colorMotionMapping.enabled ? (
              <div className="audio-shape-motion-controls">
                <label className="control-field">
                  <span>Source</span>
                  <select
                    value={colorMotionMapping.source}
                    onChange={(event) =>
                      updateShapeMotionMapping(colorMotionDefinition.name, {
                        source: event.target.value as ShapeMotionSource,
                      })
                    }
                  >
                    {shapeMotionSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="control-field">
                  <span>
                    {colorMotionDefinition.label}
                    <strong>
                      {formatShapeControlValue(
                        colorMotionMapping.amount,
                        colorMotionDefinition.motionAmountStep,
                      )}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={colorMotionDefinition.motionAmountMax}
                    step={colorMotionDefinition.motionAmountStep}
                    value={colorMotionMapping.amount}
                    onChange={(event) =>
                      updateShapeMotionMapping(colorMotionDefinition.name, {
                        amount: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="audio-shape-motion-toggle">
                  <input
                    type="checkbox"
                    checked={colorMotionMapping.invert}
                    onChange={(event) =>
                      updateShapeMotionMapping(colorMotionDefinition.name, {
                        invert: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>Invert</span>
                </label>
              </div>
            ) : null}
          </div>
        </div>

        {centerShape.positionMode === "spiral" ? (
          <div
            className="audio-shape-spiral-controls"
            aria-label="Spiral motion controls"
          >
            <div className="audio-shape-control">
              <label className="audio-shape-motion-toggle">
                <input
                  type="checkbox"
                  checked={centerShape.spiralMotion.enabled}
                  onChange={(event) =>
                    updateCenterShapeSpiralMotion({
                      enabled: event.currentTarget.checked,
                    })
                  }
                />
                <span>Run Spiral</span>
              </label>
              <label className="audio-shape-motion-toggle">
                <input
                  type="checkbox"
                  checked={centerShape.spiralMotion.visualize}
                  onChange={(event) =>
                    updateCenterShapeSpiralMotion({
                      visualize: event.currentTarget.checked,
                    })
                  }
                />
                <span>Show Path</span>
              </label>
            </div>

            <div className="audio-shape-control">
              <ControlSlider
                label="Start Radius"
                value={centerShape.spiralMotion.startRadius}
                min={0}
                max={4}
                step={0.01}
                onValueChange={(startRadius) =>
                  updateCenterShapeSpiralMotion({ startRadius })
                }
              />
            </div>

            <div className="audio-shape-control">
              <label className="control-field">
                <span>Radius Source</span>
                <select
                  value={centerShape.spiralMotion.radiusSource}
                  onChange={(event) =>
                    updateCenterShapeSpiralMotion({
                      radiusSource: event.target.value as VisualCvModulationSource,
                    })
                  }
                >
                  {visualCvModulationSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="audio-shape-control">
              <ControlSlider
                label="Radius CV Amount"
                value={centerShape.spiralMotion.radiusCvAmount}
                min={0}
                max={2}
                step={0.01}
                onValueChange={(radiusCvAmount) =>
                  updateCenterShapeSpiralMotion({ radiusCvAmount })
                }
              />
            </div>

            <div className="audio-shape-control">
              <ControlSlider
                label="Degrees Per Pulse"
                value={centerShape.spiralMotion.degreesPerPulse}
                min={0}
                max={1080}
                step={1}
                onValueChange={(degreesPerPulse) =>
                  updateCenterShapeSpiralMotion({ degreesPerPulse })
                }
              />
            </div>

            <div className="audio-shape-control">
              <ControlSlider
                label="Depth Per Pulse"
                value={centerShape.spiralMotion.depthPerPulse}
                min={0}
                max={5}
                step={0.01}
                onValueChange={(depthPerPulse) =>
                  updateCenterShapeSpiralMotion({ depthPerPulse })
                }
              />
            </div>

            <div className="audio-shape-control">
              <label className="control-field">
                <span>
                  Reset Seconds
                  <strong>
                    {formatMilliseconds(centerShape.spiralMotion.resetMs)}
                  </strong>
                </span>
                <div className="audio-shape-reset-row">
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={formatResetSecondsInput(
                      centerShape.spiralMotion.resetMs,
                    )}
                    onChange={(event) => {
                      const nextSeconds = Number(event.target.value)

                      if (!Number.isFinite(nextSeconds)) {
                        return
                      }

                      updateCenterShapeSpiralMotion({
                        resetMs: Math.max(nextSeconds * 1000, 250),
                      })
                    }}
                  />
                  <span className="audio-shape-reset-unit">sec</span>
                  <span
                    className="audio-shape-reset-spinner"
                    aria-label={`Spiral reset timer ${Math.round(spiralResetProgress * 100)}%`}
                    style={
                      {
                        "--reset-progress": `${spiralResetProgress * 360}deg`,
                      } as CSSProperties
                    }
                    title={`Spiral reset timer ${Math.round(spiralResetProgress * 100)}%`}
                  />
                </div>
              </label>
            </div>

            <div className="audio-shape-control">
              <label className="control-field">
                <span>Direction</span>
                <select
                  value={centerShape.spiralMotion.direction}
                  onChange={(event) =>
                    updateCenterShapeSpiralMotion({
                      direction:
                        event.target.value as ShapeSpiralMotionDirection,
                    })
                  }
                >
                  {shapeSpiralDirectionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="audio-shape-control">
              <ControlSlider
                label="Start Phase"
                value={centerShape.spiralMotion.startPhaseDegrees}
                min={-360}
                max={360}
                step={1}
                onValueChange={(startPhaseDegrees) =>
                  updateCenterShapeSpiralMotion({ startPhaseDegrees })
                }
              />
            </div>
          </div>
        ) : null}

        <div className="audio-shape-control-grid">
          {visibleShapeControls.map((definition) => {
            const mapping = centerShape.motionMappings[definition.name]
            const rawValue = getShapeControlValue(centerShape, definition.name)
            const isPolyhedronSides =
              definition.name === "sides" &&
              centerShape.mode === "3d" &&
              centerShape.family === "polyhedron"
            const value = isPolyhedronSides
              ? getNearestPolyhedronSideCount(rawValue)
              : rawValue
            const supportsContinuousMotion =
              supportsContinuousShapeMotion(definition.name)
            const continuousMode =
              supportsContinuousMotion && mapping.mode === "continuous"
            const resetStartedAt =
              resetCycleStartsRef.current[definition.name] ?? resetProgressNow
            const resetProgress = getResetProgress({
              now: resetProgressNow,
              resetMs: mapping.resetMs,
              startedAt: resetStartedAt,
            })
            const hidePositionCvMotion =
              centerShape.positionMode === "spiral" &&
              isPositionShapeControl(definition.name)

            return (
              <div className="audio-shape-control" key={definition.name}>
                <label className="control-field">
                  <span>
                    {isPolyhedronSides ? "Polyhedron" : definition.label}
                    <strong>
                      {formatShapeControlValue(value, definition.step)}
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={definition.min}
                    max={definition.max}
                    step={definition.step}
                    value={value}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value)

                      updateShapeParameter(
                        definition.name,
                        isPolyhedronSides
                          ? getNearestPolyhedronSideCount(nextValue)
                          : nextValue,
                      )
                    }}
                  />
                </label>

                {!hidePositionCvMotion ? (
                  <label className="audio-shape-motion-toggle">
                    <input
                      type="checkbox"
                      checked={mapping.enabled}
                      onChange={(event) =>
                        updateShapeMotionMapping(definition.name, {
                          enabled: event.currentTarget.checked,
                        })
                      }
                    />
                    <span>Use CV Motion</span>
                  </label>
                ) : null}

                {!hidePositionCvMotion && mapping.enabled ? (
                  <div className="audio-shape-motion-controls">
                    {supportsContinuousMotion ? (
                      <label className="control-field">
                        <span>Mode</span>
                        <select
                          value={mapping.mode}
                          onChange={(event) =>
                            updateShapeMotionMapping(definition.name, {
                              mode: event.target.value as ShapeMotionMode,
                            })
                          }
                        >
                          {shapeMotionModeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {!continuousMode ? (
                      <label className="control-field">
                        <span>Source</span>
                        <select
                          value={mapping.source}
                          onChange={(event) =>
                            updateShapeMotionMapping(definition.name, {
                              source: event.target.value as ShapeMotionSource,
                            })
                          }
                        >
                          {shapeMotionSourceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="control-field">
                      <span>
                        {continuousMode ? "Per Cycle" : "Amount"}
                        <strong>
                          {formatShapeControlValue(
                            mapping.amount,
                            definition.motionAmountStep,
                          )}
                        </strong>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={definition.motionAmountMax}
                        step={definition.motionAmountStep}
                        value={mapping.amount}
                        onChange={(event) =>
                          updateShapeMotionMapping(definition.name, {
                            amount: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    {continuousMode && isPositionShapeControl(definition.name) ? (
                      <label className="control-field">
                        <span>
                          Reset
                          <strong>{formatMilliseconds(mapping.resetMs)}</strong>
                        </span>
                        <div className="audio-shape-reset-row">
                          <input
                            type="number"
                            min={0.25}
                            step={0.25}
                            value={formatResetSecondsInput(mapping.resetMs)}
                            onChange={(event) => {
                              const nextSeconds = Number(event.target.value)

                              if (!Number.isFinite(nextSeconds)) {
                                return
                              }

                              updateShapeMotionMapping(definition.name, {
                                resetMs: Math.max(nextSeconds * 1000, 250),
                              })
                            }}
                          />
                          <span className="audio-shape-reset-unit">sec</span>
                          <span
                            className="audio-shape-reset-spinner"
                            aria-label={`Reset timer ${Math.round(resetProgress * 100)}%`}
                            style={
                              {
                                "--reset-progress": `${resetProgress * 360}deg`,
                              } as CSSProperties
                            }
                            title={`Reset timer ${Math.round(resetProgress * 100)}%`}
                          />
                        </div>
                      </label>
                    ) : null}
                    <label className="audio-shape-motion-toggle">
                      <input
                        type="checkbox"
                        checked={mapping.invert}
                        onChange={(event) =>
                          updateShapeMotionMapping(definition.name, {
                            invert: event.currentTarget.checked,
                          })
                        }
                      />
                      <span>Invert</span>
                    </label>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
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
