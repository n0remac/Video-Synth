"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import {
  defaultVisualCvEnvelopeConfig,
  defaultVisualCvSmoothConfig,
} from "@/features/visualCv/visualCvDefaults"
import {
  updateVisualCvEnvelope,
  updateVisualCvSmooth,
} from "@/features/visualCv/visualCvLogic"
import type {
  VisualCvEnvelopeConfig,
  VisualCvEnvelopePhase,
  VisualCvEnvelopeState,
  VisualCvInputFrame,
  VisualCvInputSignal,
  VisualCvSmoothConfig,
  VisualCvSmoothState,
} from "@/features/visualCv/visualCvTypes"
import { ControlSlider } from "../shared/ControlSlider"

export type VisualCvPreviewPanelHandle = {
  receiveInput(input: VisualCvInputFrame): void
}

type VisualCvPreviewPanelProps = {
  resetKey: string
}

type CvHistorySample = {
  timestamp: number
  raw: number
  output: number
}

type VisualCvSnapshot = {
  input: VisualCvInputFrame | null
  smoothRaw: number
  smoothOutput: number
  envelopeRaw: number
  envelopeOutput: number
  envelopePhase: VisualCvEnvelopePhase
}

const historyDurationMs = 8000

const visualCvInputOptions: Array<{
  value: VisualCvInputSignal
  label: string
}> = [
  { value: "level", label: "Level" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
  { value: "motion", label: "Motion" },
]

const emptySnapshot: VisualCvSnapshot = {
  input: null,
  smoothRaw: 0,
  smoothOutput: 0,
  envelopeRaw: 0,
  envelopeOutput: 0,
  envelopePhase: "idle",
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatPercent(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

function getInputLabel(input: VisualCvInputSignal) {
  return (
    visualCvInputOptions.find((option) => option.value === input)?.label ??
    "Level"
  )
}

function trimHistory(history: CvHistorySample[], timestamp: number) {
  const earliestTimestamp = timestamp - historyDurationMs

  return history.filter((sample) => sample.timestamp >= earliestTimestamp)
}

function getGraphPoint({
  graphHeight,
  graphWidth,
  graphX,
  graphY,
  sample,
  startTime,
  value,
}: {
  graphHeight: number
  graphWidth: number
  graphX: number
  graphY: number
  sample: CvHistorySample
  startTime: number
  value: number
}) {
  return {
    x:
      graphX +
      clamp((sample.timestamp - startTime) / historyDurationMs, 0, 1) *
        graphWidth,
    y: graphY + graphHeight - clamp(value, 0, 1) * graphHeight,
  }
}

function drawTrace({
  context,
  getValue,
  graphHeight,
  graphWidth,
  graphX,
  graphY,
  history,
  lineWidth,
  now,
  strokeStyle,
}: {
  context: CanvasRenderingContext2D
  getValue(sample: CvHistorySample): number
  graphHeight: number
  graphWidth: number
  graphX: number
  graphY: number
  history: CvHistorySample[]
  lineWidth: number
  now: number
  strokeStyle: string
}) {
  if (history.length < 2) {
    return
  }

  const startTime = now - historyDurationMs

  context.strokeStyle = strokeStyle
  context.lineWidth = lineWidth
  context.beginPath()

  history.forEach((sample, index) => {
    const point = getGraphPoint({
      graphHeight,
      graphWidth,
      graphX,
      graphY,
      sample,
      startTime,
      value: getValue(sample),
    })

    if (index === 0) {
      context.moveTo(point.x, point.y)
      return
    }

    context.lineTo(point.x, point.y)
  })

  context.stroke()
}

function drawVisualCvGraph({
  canvas,
  history,
  now,
  threshold,
}: {
  canvas: HTMLCanvasElement | null
  history: CvHistorySample[]
  now: number
  threshold?: number
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
  const graphX = padding
  const graphY = 12
  const graphWidth = Math.max(width - padding * 2, 1)
  const graphHeight = Math.max(height - 24, 1)

  context.fillStyle = "rgba(255, 255, 255, 0.035)"
  context.fillRect(graphX, graphY, graphWidth, graphHeight)

  for (let tick = 0.25; tick < 1; tick += 0.25) {
    const y = graphY + graphHeight - tick * graphHeight

    context.strokeStyle = "rgba(247, 247, 255, 0.08)"
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(graphX, y)
    context.lineTo(graphX + graphWidth, y)
    context.stroke()
  }

  if (threshold !== undefined) {
    const thresholdY =
      graphY + graphHeight - clamp(threshold, 0, 1) * graphHeight

    context.strokeStyle = "rgba(255, 225, 86, 0.72)"
    context.lineWidth = 1
    context.setLineDash([5, 5])
    context.beginPath()
    context.moveTo(graphX, thresholdY)
    context.lineTo(graphX + graphWidth, thresholdY)
    context.stroke()
    context.setLineDash([])
  }

  if (history.length < 2) {
    context.fillStyle = "rgba(247, 247, 255, 0.5)"
    context.font = "700 12px sans-serif"
    context.fillText("Waiting for CV input", graphX, graphY + 24)
  }

  drawTrace({
    context,
    getValue: (sample) => sample.raw,
    graphHeight,
    graphWidth,
    graphX,
    graphY,
    history,
    lineWidth: 1,
    now,
    strokeStyle: "rgba(0, 209, 255, 0.48)",
  })
  drawTrace({
    context,
    getValue: (sample) => sample.output,
    graphHeight,
    graphWidth,
    graphX,
    graphY,
    history,
    lineWidth: 2,
    now,
    strokeStyle: "#f7f7ff",
  })

  context.strokeStyle = "rgba(247, 247, 255, 0.16)"
  context.lineWidth = 1
  context.strokeRect(graphX, graphY, graphWidth, graphHeight)
}

export const VisualCvPreviewPanel = forwardRef<
  VisualCvPreviewPanelHandle,
  VisualCvPreviewPanelProps
>(function VisualCvPreviewPanel({ resetKey }, ref) {
  const smoothCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const envelopeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const smoothConfigRef = useRef<VisualCvSmoothConfig>(
    defaultVisualCvSmoothConfig,
  )
  const envelopeConfigRef = useRef<VisualCvEnvelopeConfig>(
    defaultVisualCvEnvelopeConfig,
  )
  const smoothStateRef = useRef<VisualCvSmoothState | null>(null)
  const envelopeStateRef = useRef<VisualCvEnvelopeState | null>(null)
  const smoothHistoryRef = useRef<CvHistorySample[]>([])
  const envelopeHistoryRef = useRef<CvHistorySample[]>([])
  const lastSnapshotAtRef = useRef(Number.NEGATIVE_INFINITY)
  const [smoothConfig, setSmoothConfig] = useState<VisualCvSmoothConfig>(
    defaultVisualCvSmoothConfig,
  )
  const [envelopeConfig, setEnvelopeConfig] =
    useState<VisualCvEnvelopeConfig>(defaultVisualCvEnvelopeConfig)
  const [snapshot, setSnapshot] = useState<VisualCvSnapshot>(emptySnapshot)

  useEffect(() => {
    smoothConfigRef.current = smoothConfig
  }, [smoothConfig])

  useEffect(() => {
    envelopeConfigRef.current = envelopeConfig
    drawVisualCvGraph({
      canvas: envelopeCanvasRef.current,
      history: envelopeHistoryRef.current,
      now: envelopeHistoryRef.current.at(-1)?.timestamp ?? 0,
      threshold: envelopeConfig.threshold,
    })
  }, [envelopeConfig])

  useEffect(() => {
    smoothStateRef.current = null
    envelopeStateRef.current = null
    smoothHistoryRef.current = []
    envelopeHistoryRef.current = []
    lastSnapshotAtRef.current = Number.NEGATIVE_INFINITY
    setSnapshot(emptySnapshot)
    drawVisualCvGraph({
      canvas: smoothCanvasRef.current,
      history: [],
      now: 0,
    })
    drawVisualCvGraph({
      canvas: envelopeCanvasRef.current,
      history: [],
      now: 0,
      threshold: envelopeConfigRef.current.threshold,
    })
  }, [resetKey])

  useImperativeHandle(
    ref,
    () => ({
      receiveInput(input) {
        const smoothResult = updateVisualCvSmooth({
          config: smoothConfigRef.current,
          frame: input,
          state: smoothStateRef.current,
        })
        const envelopeResult = updateVisualCvEnvelope({
          config: envelopeConfigRef.current,
          frame: input,
          state: envelopeStateRef.current,
        })

        smoothStateRef.current = smoothResult.state
        envelopeStateRef.current = envelopeResult.state
        smoothHistoryRef.current = trimHistory(
          [
            ...smoothHistoryRef.current,
            {
              timestamp: input.timestamp,
              raw: smoothResult.raw,
              output: smoothResult.output,
            },
          ],
          input.timestamp,
        )
        envelopeHistoryRef.current = trimHistory(
          [
            ...envelopeHistoryRef.current,
            {
              timestamp: input.timestamp,
              raw: envelopeResult.raw,
              output: envelopeResult.output,
            },
          ],
          input.timestamp,
        )

        drawVisualCvGraph({
          canvas: smoothCanvasRef.current,
          history: smoothHistoryRef.current,
          now: input.timestamp,
        })
        drawVisualCvGraph({
          canvas: envelopeCanvasRef.current,
          history: envelopeHistoryRef.current,
          now: input.timestamp,
          threshold: envelopeConfigRef.current.threshold,
        })

        if (
          input.timestamp < lastSnapshotAtRef.current ||
          input.timestamp - lastSnapshotAtRef.current >= 100
        ) {
          lastSnapshotAtRef.current = input.timestamp
          setSnapshot({
            input,
            smoothRaw: smoothResult.raw,
            smoothOutput: smoothResult.output,
            envelopeRaw: envelopeResult.raw,
            envelopeOutput: envelopeResult.output,
            envelopePhase: envelopeResult.state.phase,
          })
        }
      },
    }),
    [],
  )

  function updateSmoothInput(input: VisualCvInputSignal) {
    smoothStateRef.current = null
    smoothHistoryRef.current = []
    drawVisualCvGraph({
      canvas: smoothCanvasRef.current,
      history: [],
      now: 0,
    })
    setSmoothConfig((currentConfig) => ({
      ...currentConfig,
      input,
    }))
  }

  return (
    <section className="audio-cv-panel" aria-label="Visual CV preview">
      <header className="audio-cv-header">
        <div>
          <p className="eyebrow">Visual CV</p>
          <h2>Selected Range Modules</h2>
        </div>
        <div className="audio-cv-input-bus" aria-label="Current CV input bus">
          <div>
            <span>Level</span>
            <strong>{formatPercent(snapshot.input?.level)}</strong>
          </div>
          <div>
            <span>Rise</span>
            <strong>{formatPercent(snapshot.input?.riseAmount)}</strong>
          </div>
          <div>
            <span>Fall</span>
            <strong>{formatPercent(snapshot.input?.fallAmount)}</strong>
          </div>
        </div>
      </header>

      <div className="visual-cv-module-grid">
        <article className="visual-cv-module">
          <header>
            <div>
              <p className="eyebrow">CV Smooth</p>
              <h3>{getInputLabel(smoothConfig.input)} Slew</h3>
            </div>
            <div className="visual-cv-phase" data-phase="smooth">
              Smooth
            </div>
          </header>
          <div className="visual-cv-controls">
            <label className="control-field">
              <span>
                Input <strong>{getInputLabel(smoothConfig.input)}</strong>
              </span>
              <select
                value={smoothConfig.input}
                onChange={(event) =>
                  updateSmoothInput(event.currentTarget.value as VisualCvInputSignal)
                }
              >
                {visualCvInputOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ControlSlider
              label="Rise ms"
              value={smoothConfig.riseMs}
              min={0}
              max={1500}
              step={10}
              onValueChange={(riseMs) =>
                setSmoothConfig((currentConfig) => ({
                  ...currentConfig,
                  riseMs,
                }))
              }
            />
            <ControlSlider
              label="Fall ms"
              value={smoothConfig.fallMs}
              min={0}
              max={1500}
              step={10}
              onValueChange={(fallMs) =>
                setSmoothConfig((currentConfig) => ({
                  ...currentConfig,
                  fallMs,
                }))
              }
            />
          </div>
          <canvas
            ref={smoothCanvasRef}
            className="visual-cv-canvas"
            aria-label="Smooth CV raw and output graph"
          />
          <div className="visual-cv-meter-grid">
            <div className="visual-cv-meter" data-kind="raw">
              <span>Raw</span>
              <div>
                <i style={{ width: formatPercent(snapshot.smoothRaw) }} />
              </div>
              <strong>{formatPercent(snapshot.smoothRaw)}</strong>
            </div>
            <div className="visual-cv-meter" data-kind="output">
              <span>Out</span>
              <div>
                <i style={{ width: formatPercent(snapshot.smoothOutput) }} />
              </div>
              <strong>{formatPercent(snapshot.smoothOutput)}</strong>
            </div>
          </div>
        </article>

        <article className="visual-cv-module">
          <header>
            <div>
              <p className="eyebrow">CV Envelope</p>
              <h3>Rise Trigger</h3>
            </div>
            <div className="visual-cv-phase" data-phase={snapshot.envelopePhase}>
              {snapshot.envelopePhase}
            </div>
          </header>
          <div className="visual-cv-controls">
            <ControlSlider
              label="Threshold"
              value={envelopeConfig.threshold}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(threshold) =>
                setEnvelopeConfig((currentConfig) => ({
                  ...currentConfig,
                  threshold,
                }))
              }
            />
            <ControlSlider
              label="Attack ms"
              value={envelopeConfig.attackMs}
              min={0}
              max={1000}
              step={10}
              onValueChange={(attackMs) =>
                setEnvelopeConfig((currentConfig) => ({
                  ...currentConfig,
                  attackMs,
                }))
              }
            />
            <ControlSlider
              label="Decay ms"
              value={envelopeConfig.decayMs}
              min={0}
              max={2500}
              step={10}
              onValueChange={(decayMs) =>
                setEnvelopeConfig((currentConfig) => ({
                  ...currentConfig,
                  decayMs,
                }))
              }
            />
            <ControlSlider
              label="Cooldown ms"
              value={envelopeConfig.cooldownMs}
              min={0}
              max={1200}
              step={10}
              onValueChange={(cooldownMs) =>
                setEnvelopeConfig((currentConfig) => ({
                  ...currentConfig,
                  cooldownMs,
                }))
              }
            />
          </div>
          <canvas
            ref={envelopeCanvasRef}
            className="visual-cv-canvas"
            aria-label="Envelope CV trigger input and output graph"
          />
          <div className="visual-cv-meter-grid">
            <div className="visual-cv-meter" data-kind="raw">
              <span>Rise</span>
              <div>
                <i style={{ width: formatPercent(snapshot.envelopeRaw) }} />
              </div>
              <strong>{formatPercent(snapshot.envelopeRaw)}</strong>
            </div>
            <div className="visual-cv-meter" data-kind="output">
              <span>Out</span>
              <div>
                <i style={{ width: formatPercent(snapshot.envelopeOutput) }} />
              </div>
              <strong>{formatPercent(snapshot.envelopeOutput)}</strong>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
})
