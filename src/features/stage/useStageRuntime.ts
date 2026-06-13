"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { createStageAudioFrameMessage } from "@/features/network/protocol"
import { parseVisualizerMessage } from "@/features/network/messageValidation"
import type { PointerMessage } from "@/features/network/protocolTypes"
import type { AudioAnalysisFrame } from "@/features/network/protocolTypes"
import { getVisualizerSocketUrl } from "@/features/network/protocol"
import { stageConfig } from "./stageConfig"
import { createCamera, resizeCameraToViewport } from "./render/createCamera"
import { startAnimationLoop } from "./render/animationLoop"
import { createRenderer } from "./render/createRenderer"
import { createScene } from "./render/createScene"
import { ColorControlModule } from "./modules/colorControl"
import { RipplePaintModule } from "./modules/ripplePaint"
import { TrailPaintModule } from "./modules/trailPaint"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

type PointerWorld = {
  x: number
  y: number
}

function messageToRippleInput(
  message: PointerMessage,
  world: { worldWidth: number; worldHeight: number },
  color: string,
) {
  return {
    id: `${message.userId}-${message.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    userId: message.userId,
    x: (message.x - 0.5) * world.worldWidth,
    y: (0.5 - message.y) * world.worldHeight,
    speed: message.speed,
    color,
  }
}

function messageToTrailInput(
  message: PointerMessage,
  world: { worldWidth: number; worldHeight: number },
  color: string,
) {
  return {
    userId: message.userId,
    x: (message.x - 0.5) * world.worldWidth,
    y: (0.5 - message.y) * world.worldHeight,
    vx: message.vx * world.worldWidth,
    vy: -message.vy * world.worldHeight,
    color,
    down: message.down,
    lineCount: message.trailLineCount,
    trailLength: message.trailLength,
  }
}

function getPointerWorld(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  world: { worldWidth: number; worldHeight: number },
): PointerWorld {
  const rect = canvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height

  return {
    x: (x - 0.5) * world.worldWidth,
    y: (0.5 - y) * world.worldHeight,
  }
}

export function useStageRuntime() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")

  function sendAudioFrame(frame: AudioAnalysisFrame) {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(
      JSON.stringify(
        createStageAudioFrameMessage({
          type: "stage_audio_frame",
          frame,
          timestamp: Date.now(),
        }),
      ),
    )
  }

  const api = useMemo(
    () => ({
      canvasRef,
      connectionStatus,
      sendAudioFrame,
    }),
    [connectionStatus],
  )

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const activeCanvas = canvas
    const renderer = createRenderer(activeCanvas)
    const scene = createScene()
    scene.background = new THREE.Color(stageConfig.backgroundColor)
    const camera = createCamera(stageConfig.worldWidth, stageConfig.worldHeight)
    const colorControl = new ColorControlModule()
    const ripplePaint = new RipplePaintModule({
      scene,
      maxRipples: stageConfig.maxRipples,
    })
    const trailPaint = new TrailPaintModule({ scene })
    const world = resizeCameraToViewport(camera, stageConfig.worldHeight)
    let localPointerPrevious: PointerWorld | null = null

    const socket = new WebSocket(getVisualizerSocketUrl("stage"))
    socketRef.current = socket
    setConnectionStatus("connecting")

    socket.addEventListener("open", () => {
      setConnectionStatus("connected")
    })

    socket.addEventListener("close", () => {
      setConnectionStatus("disconnected")
    })

    socket.addEventListener("error", () => {
      setConnectionStatus("disconnected")
    })

    socket.addEventListener("message", (event) => {
      const message = parseVisualizerMessage(String(event.data))

      if (!message) {
        return
      }

      if (
        message.type === "pointer" &&
        message.visualMode === "circle" &&
        message.down
      ) {
        const color = colorControl.resolveDrawColor(
          message.userId,
          message.color,
          message.userRole,
        )
        ripplePaint.receiveInput(messageToRippleInput(message, world, color))
      }

      if (message.type === "pointer" && message.visualMode === "line") {
        const color = colorControl.resolveDrawColor(
          message.userId,
          message.color,
          message.userRole,
        )
        trailPaint.receiveInput(messageToTrailInput(message, world, color))
      }

      if (message.type === "color_control") {
        colorControl.receiveInput(message)
        scene.background = new THREE.Color(
          colorControl.resolveBackgroundColor(stageConfig.backgroundColor),
        )
      }

      if (message.type === "clear_stage") {
        ripplePaint.clear()
        trailPaint.clear()
      }
    })

    function handleResize() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(window.innerWidth, window.innerHeight, false)
      Object.assign(world, resizeCameraToViewport(camera, stageConfig.worldHeight))
    }

    function handlePointerDown(event: PointerEvent) {
      activeCanvas.setPointerCapture(event.pointerId)
      localPointerPrevious = getPointerWorld(event, activeCanvas, world)
      ripplePaint.receiveInput({
        id: `stage-local-${performance.now()}`,
        userId: "stage-local",
        x: localPointerPrevious.x,
        y: localPointerPrevious.y,
        speed: 0,
        color: "#ffffff",
      })
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.buttons === 0) {
        return
      }

      const next = getPointerWorld(event, activeCanvas, world)
      const speed = localPointerPrevious
        ? Math.hypot(next.x - localPointerPrevious.x, next.y - localPointerPrevious.y) *
          20
        : 0

      localPointerPrevious = next
      ripplePaint.receiveInput({
        id: `stage-local-${performance.now()}`,
        userId: "stage-local",
        x: next.x,
        y: next.y,
        speed,
        color: "#ffffff",
      })
    }

    function handlePointerUp(event: PointerEvent) {
      localPointerPrevious = null
      if (activeCanvas.hasPointerCapture(event.pointerId)) {
        activeCanvas.releasePointerCapture(event.pointerId)
      }
    }

    window.addEventListener("resize", handleResize)
    activeCanvas.addEventListener("pointerdown", handlePointerDown)
    activeCanvas.addEventListener("pointermove", handlePointerMove)
    activeCanvas.addEventListener("pointerup", handlePointerUp)
    activeCanvas.addEventListener("pointercancel", handlePointerUp)

    const loop = startAnimationLoop((dt) => {
      ripplePaint.update(dt)
      trailPaint.update(dt)
      colorControl.update()
      scene.background = new THREE.Color(
        colorControl.resolveBackgroundColor(stageConfig.backgroundColor),
      )
      renderer.render(scene, camera)
    })

    return () => {
      loop.stop()
      socket.close()
      socketRef.current = null
      window.removeEventListener("resize", handleResize)
      activeCanvas.removeEventListener("pointerdown", handlePointerDown)
      activeCanvas.removeEventListener("pointermove", handlePointerMove)
      activeCanvas.removeEventListener("pointerup", handlePointerUp)
      activeCanvas.removeEventListener("pointercancel", handlePointerUp)
      colorControl.dispose()
      ripplePaint.dispose()
      trailPaint.dispose()
      renderer.dispose()
    }
  }, [])

  return api
}
