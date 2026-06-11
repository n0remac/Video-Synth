"use client"

import { useEffect, useState } from "react"
import { ColorPicker } from "./components/ColorPicker"
import { ControlSlider } from "./components/ControlSlider"
import { ControllerNav } from "./components/ControllerNav"
import { TouchPad } from "./components/TouchPad"
import { useControllerSocket } from "./useControllerSocket"
import { usePointerController } from "./usePointerController"

export function ControllerView() {
  const socket = useControllerSocket("controller")
  const [visualMode, setVisualMode] = useState<"circle" | "line">("circle")
  const [color, setColor] = useState(socket.assignedColor)
  const [intensity, setIntensity] = useState(0.65)
  const [trailLineCount, setTrailLineCount] = useState(3)
  const [trailLength, setTrailLength] = useState(1.2)

  useEffect(() => {
    setColor(socket.assignedColor)
  }, [socket.assignedColor])

  const pointer = usePointerController({
    userId: socket.userId,
    color,
    intensity,
    visualMode,
    trailLineCount,
    trailLength,
    sendPointer: socket.sendPointer,
  })

  return (
    <main className="controller-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Draw</h1>
        </div>
        <div className="connection-pill" data-status={socket.status}>
          {socket.status}
        </div>
      </header>

      <TouchPad pointerDown={pointer.pointerDown} handlers={pointer.handlers} />

      <section className="control-panel">
        <div className="mode-toggle" role="group" aria-label="Drawing mode">
          <button
            type="button"
            data-active={visualMode === "circle"}
            onClick={() => setVisualMode("circle")}
          >
            Circle
          </button>
          <button
            type="button"
            data-active={visualMode === "line"}
            onClick={() => setVisualMode("line")}
          >
            Line
          </button>
        </div>
        <ColorPicker color={color} onColorChange={setColor} />
        {visualMode === "circle" ? (
          <ControlSlider
            label="Intensity"
            value={intensity}
            min={0.1}
            max={1}
            step={0.01}
            onValueChange={setIntensity}
          />
        ) : (
          <>
            <ControlSlider
              label="Lines"
              value={trailLineCount}
              min={1}
              max={9}
              step={1}
              onValueChange={setTrailLineCount}
            />
            <ControlSlider
              label="Length"
              value={trailLength}
              min={0.25}
              max={3}
              step={0.05}
              onValueChange={setTrailLength}
            />
          </>
        )}
        <div className="current-color">
          <span>Assigned</span>
          <div className="color-swatch" style={{ backgroundColor: color }} />
        </div>
        <button
          type="button"
          className="clear-button"
          onClick={socket.clearStage}
          disabled={!socket.connected}
        >
          Clear
        </button>
      </section>
    </main>
  )
}
