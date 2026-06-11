"use client"

import { useEffect, useRef } from "react"
import { ControllerNav } from "./components/ControllerNav"
import { useAudioAnalyser } from "./useAudioAnalyser"

function formatPercent(value: number | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

export function AudioControllerView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audio = useAudioAnalyser()

  useEffect(() => {
    const canvas = canvasRef.current
    const spectrum = audio.frame?.spectrum

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
    const barWidth = Math.max(2, (width - gap * (spectrum.length - 1)) / spectrum.length)

    spectrum.forEach((value, index) => {
      const x = index * (barWidth + gap)
      const barHeight = Math.max(2, value * height)
      const hue = 190 + index / Math.max(spectrum.length - 1, 1) * 110

      context.fillStyle = `hsl(${hue}, 95%, ${42 + value * 30}%)`
      context.fillRect(x, height - barHeight, barWidth, barHeight)
    })
  }, [audio.frame])

  return (
    <main className="controller-shell audio-controller-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Audio</h1>
        </div>
        <div className="connection-pill" data-status={audio.status}>
          {audio.status}
        </div>
      </header>

      <section className="audio-spectrum-panel">
        <canvas ref={canvasRef} className="audio-spectrum-canvas" />
      </section>

      <section className="audio-control-panel">
        <button
          type="button"
          className="clear-button"
          onClick={audio.running ? audio.stop : audio.start}
        >
          {audio.running ? "Stop Audio" : "Start Audio"}
        </button>
        <div className="audio-meter">
          <span>Volume</span>
          <strong>{formatPercent(audio.frame?.volume)}</strong>
        </div>
        <div className="audio-meter">
          <span>Low</span>
          <strong>{formatPercent(audio.frame?.low)}</strong>
        </div>
        <div className="audio-meter">
          <span>Mid</span>
          <strong>{formatPercent(audio.frame?.mid)}</strong>
        </div>
        <div className="audio-meter">
          <span>High</span>
          <strong>{formatPercent(audio.frame?.high)}</strong>
        </div>
        <div className="audio-meter">
          <span>Peak</span>
          <strong>{audio.frame?.dominantBin ?? 0}</strong>
        </div>
      </section>

      {audio.error ? <p className="audio-error">{audio.error}</p> : null}
    </main>
  )
}
