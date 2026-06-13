"use client"

import { useCallback, useRef, useState } from "react"
import type { PointerEvent } from "react"
import { clamp } from "@/shared/math/clamp"
import { createPointerMessage } from "@/features/network/protocol"
import type { PointerMessage } from "@/features/network/protocolTypes"
import type {
  NormalizedPointer,
  PointerVelocity,
} from "./controllerTypes"

type UsePointerControllerOptions = {
  userId: string
  color: string
  intensity: number
  visualMode: "circle" | "line"
  trailLineCount: number
  trailLength: number
  sendPointer(message: PointerMessage): void
  onPointerSample?(sample: NormalizedPointer): void
}

const messageIntervalMs = 1000 / 30

function getNormalizedPointer(
  element: HTMLElement,
  clientX: number,
  clientY: number,
): NormalizedPointer {
  const rect = element.getBoundingClientRect()

  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  }
}

function calculateVelocity(
  next: NormalizedPointer,
  previous: { x: number; y: number; timestamp: number } | null,
  timestamp: number,
): PointerVelocity {
  if (!previous) {
    return { vx: 0, vy: 0, speed: 0 }
  }

  const dt = Math.max((timestamp - previous.timestamp) / 1000, 0.001)
  const vx = (next.x - previous.x) / dt
  const vy = (next.y - previous.y) / dt

  return {
    vx,
    vy,
    speed: Math.hypot(vx, vy),
  }
}

export function usePointerController(options: UsePointerControllerOptions) {
  const [pointerDown, setPointerDown] = useState(false)
  const lastPointerRef = useRef<{
    x: number
    y: number
    timestamp: number
  } | null>(null)
  const lastSentAtRef = useRef(0)

  const emitPointer = useCallback(
    (
      element: HTMLElement,
      clientX: number,
      clientY: number,
      down: boolean,
      force = false,
    ) => {
      const timestamp = Date.now()

      if (!force && timestamp - lastSentAtRef.current < messageIntervalMs) {
        return
      }

      const pointer = getNormalizedPointer(element, clientX, clientY)
      const velocity = calculateVelocity(
        pointer,
        lastPointerRef.current,
        timestamp,
      )

      lastPointerRef.current = {
        ...pointer,
        timestamp,
      }
      lastSentAtRef.current = timestamp
      options.onPointerSample?.(pointer)

      options.sendPointer(
        createPointerMessage({
          type: "pointer",
          userId: options.userId,
          x: pointer.x,
          y: pointer.y,
          vx: velocity.vx,
          vy: velocity.vy,
          speed: velocity.speed * options.intensity,
          down,
          color: options.color,
          visualMode: options.visualMode,
          trailLineCount: options.trailLineCount,
          trailLength: options.trailLength,
          timestamp,
        }),
      )
    },
    [options],
  )

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      setPointerDown(true)
      emitPointer(event.currentTarget, event.clientX, event.clientY, true, true)
    },
    [emitPointer],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!pointerDown) {
        return
      }

      emitPointer(event.currentTarget, event.clientX, event.clientY, true)
    },
    [emitPointer, pointerDown],
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      setPointerDown(false)
      emitPointer(event.currentTarget, event.clientX, event.clientY, false, true)
      lastPointerRef.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    },
    [emitPointer],
  )

  return {
    pointerDown,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  }
}
