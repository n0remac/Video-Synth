"use client"

import { useCallback, useEffect, useState } from "react"
import type { PointerEvent } from "react"
import { createColorControlMessage } from "@/features/network/protocol"
import type {
  ColorControlMappingPreset,
  ColorControlTarget,
} from "@/features/network/protocolTypes"
import { ColorPicker } from "./components/ColorPicker"
import { ControlSlider } from "./components/ControlSlider"
import { ControllerNav } from "./components/ControllerNav"
import { TouchPad } from "./components/TouchPad"
import { useControllerSocket } from "./useControllerSocket"

type ColorTargetOption = ColorControlTarget

const colorMappingLabels: Record<ColorControlMappingPreset, string> = {
  "hue-brightness": "Hue / Bright",
  "saturation-brightness": "Sat / Bright",
  "hue-saturation": "Hue / Sat",
  "saturation-contrast": "Sat / Contrast",
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getNormalizedPointer(element: HTMLElement, event: PointerEvent<HTMLElement>) {
  const rect = element.getBoundingClientRect()

  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  }
}

export function ColorControllerView() {
  const socket = useControllerSocket("color")
  const [pointerDown, setPointerDown] = useState(false)
  const [baseColor, setBaseColor] = useState("#ff2d75")
  const [colorMapping, setColorMapping] =
    useState<ColorControlMappingPreset>("hue-brightness")
  const [colorTarget, setColorTarget] = useState<ColorTargetOption>("all")
  const [selectedUserId, setSelectedUserId] = useState("")
  const [colorAmount, setColorAmount] = useState(1)

  useEffect(() => {
    setSelectedUserId((currentUserId) => {
      if (
        currentUserId &&
        socket.users.some((user) => user.userId === currentUserId)
      ) {
        return currentUserId
      }

      return socket.users[0]?.userId ?? ""
    })
  }, [socket.users])

  const sendColorControl = useCallback(
    (x: number, y: number) => {
      if (colorTarget === "user" && !selectedUserId) {
        return
      }

      socket.sendColorControl(
        createColorControlMessage({
          type: "color_control",
          userId: socket.userId,
          source: "touch",
          target: colorTarget,
          targetUserId: colorTarget === "user" ? selectedUserId : undefined,
          mapping: colorMapping,
          x,
          y,
          baseColor,
          amount: colorAmount,
          timestamp: Date.now(),
        }),
      )
    },
    [
      baseColor,
      colorAmount,
      colorMapping,
      colorTarget,
      selectedUserId,
      socket,
    ],
  )

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setPointerDown(true)
      const pointer = getNormalizedPointer(event.currentTarget, event)
      sendColorControl(pointer.x, pointer.y)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!pointerDown) {
        return
      }

      const pointer = getNormalizedPointer(event.currentTarget, event)
      sendColorControl(pointer.x, pointer.y)
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      setPointerDown(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      setPointerDown(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
  }

  return (
    <main className="controller-shell color-controller-shell">
      <ControllerNav />
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Color</h1>
        </div>
        <div className="connection-pill" data-status={socket.status}>
          {socket.status}
        </div>
      </header>

      <TouchPad pointerDown={pointerDown} handlers={handlers} />

      <section className="color-control-panel">
        <ColorPicker color={baseColor} onColorChange={setBaseColor} />

        <label className="control-field">
          <span>Map</span>
          <select
            value={colorMapping}
            onChange={(event) =>
              setColorMapping(event.target.value as ColorControlMappingPreset)
            }
          >
            {Object.entries(colorMappingLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="control-field">
          <span>Target</span>
          <select
            value={colorTarget}
            onChange={(event) =>
              setColorTarget(event.target.value as ColorTargetOption)
            }
          >
            <option value="all">All users</option>
            <option value="background">Background</option>
            <option value="user">Selected user</option>
          </select>
        </label>

        <ControlSlider
          label="Amount"
          value={colorAmount}
          min={0}
          max={1}
          step={0.01}
          onValueChange={setColorAmount}
        />
      </section>

      <section className="user-target-panel">
        <header>
          <p className="eyebrow">Targets</p>
          <span>{socket.users.length}</span>
        </header>
        <div className="user-target-list">
          {socket.users.map((user) => (
            <button
              key={user.userId}
              type="button"
              data-active={
                colorTarget === "user" && selectedUserId === user.userId
              }
              onClick={() => {
                setSelectedUserId(user.userId)
                setColorTarget("user")
              }}
            >
              <span
                className="user-color-dot"
                style={{ backgroundColor: user.color }}
              />
              <span>
                {user.role === "audio" ? "Spectrum" : "User"} {user.userId}
              </span>
            </button>
          ))}
          {socket.users.length === 0 ? (
            <p className="empty-users">No drawing controllers connected.</p>
          ) : null}
        </div>
      </section>
    </main>
  )
}
