"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { createStageAudioFrameMessage } from "@/features/network/protocol"
import { parseVisualizerMessage } from "@/features/network/messageValidation"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  AudioRouteSignal,
  PointerMessage,
} from "@/features/network/protocolTypes"
import type { AudioWorkletTriggerEvent } from "@/features/audio/useAudioAnalyser"
import { getVisualizerSocketUrl } from "@/features/network/protocol"
import { stageConfig } from "./stageConfig"
import { createCamera, resizeCameraToViewport } from "./render/createCamera"
import { startAnimationLoop } from "./render/animationLoop"
import { createRenderer } from "./render/createRenderer"
import { createScene } from "./render/createScene"
import { ColorControlModule } from "./modules/colorControl"
import { CenterShapeModule } from "./modules/centerShape"
import { RipplePaintModule } from "./modules/ripplePaint"
import { TrailPaintModule } from "./modules/trailPaint"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

type PointerWorld = {
  x: number
  y: number
}

export type StageAudioRouteConfig = {
  audioInstanceId: string
  settings: AudioCircleSettings
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
  const audioTriggerHandlerRef = useRef<
    ((event: AudioWorkletTriggerEvent) => void) | null
  >(null)
  const audioFrameHandlerRef = useRef<((frame: AudioAnalysisFrame) => void) | null>(
    null,
  )
  const audioRouteSettingsRef = useRef(new Map<string, AudioCircleSettings>())
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")
  const [audioRoutes, setAudioRoutes] = useState<StageAudioRouteConfig[]>([])

  const handleAudioTrigger = useCallback((event: AudioWorkletTriggerEvent) => {
    audioTriggerHandlerRef.current?.(event)
  }, [])

  function sendAudioFrame(frame: AudioAnalysisFrame) {
    audioFrameHandlerRef.current?.(frame)

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
      audioRoutes,
      canvasRef,
      connectionStatus,
      handleAudioTrigger,
      sendAudioFrame,
    }),
    [audioRoutes, connectionStatus, handleAudioTrigger],
  )

  useEffect(() => {
    audioRouteSettingsRef.current = new Map(
      audioRoutes.map((route) => [route.audioInstanceId, route.settings]),
    )
  }, [audioRoutes])

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
    const centerShape = new CenterShapeModule({ scene })
    const ripplePaint = new RipplePaintModule({
      scene,
      maxRipples: stageConfig.maxRipples,
    })
    const trailPaint = new TrailPaintModule({ scene })
    const world = resizeCameraToViewport(camera, stageConfig.worldHeight)
    let localPointerPrevious: PointerWorld | null = null

    audioFrameHandlerRef.current = (frame) => {
      frame.routes?.forEach((routeSignal: AudioRouteSignal) => {
        centerShape.receiveAudioRouteSignal(routeSignal)
        ripplePaint.receiveAudioRouteSignal(routeSignal)
      })
    }

    audioTriggerHandlerRef.current = (event) => {
      const settings = audioRouteSettingsRef.current.get(event.audioInstanceId)
      const hasAudioMotion =
        settings?.circleGrowOnRise === true ||
        settings?.circleFadeOnFall === true ||
        settings?.circleShrinkOnFall === true ||
        settings?.circleLevelControlsSize === true

      ripplePaint.receiveInput({
        id: `audio-${event.audioInstanceId}-${event.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        userId: event.audioInstanceId,
        x: (Math.random() - 0.5) * world.worldWidth,
        y: (0.5 - Math.random()) * world.worldHeight,
        speed: event.level * 4,
        color: event.color,
        audioMotion:
          settings && hasAudioMotion
            ? {
                audioInstanceId: event.audioInstanceId,
                growOnRise: settings.circleGrowOnRise,
                fadeOnFall: settings.circleFadeOnFall,
                shrinkOnFall: settings.circleShrinkOnFall,
                levelControlsSize: settings.circleLevelControlsSize,
                level: event.level,
                riseAmount: event.riseAmount,
                fallAmount: event.fallAmount,
              }
            : undefined,
      })
    }

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

      if (
        message.type === "audio_settings_snapshot" ||
        message.type === "audio_settings_update"
      ) {
        setAudioRoutes((currentRoutes) => {
          const nextRoute = {
            audioInstanceId: message.audioInstanceId,
            settings: message.settings,
          }
          const existingIndex = currentRoutes.findIndex(
            (route) => route.audioInstanceId === message.audioInstanceId,
          )

          if (existingIndex === -1) {
            return [...currentRoutes, nextRoute]
          }

          return currentRoutes.map((route, index) =>
            index === existingIndex ? nextRoute : route,
          )
        })
        centerShape.receiveAudioSettings(message.audioInstanceId, message.settings)
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
      centerShape.update(dt)
      colorControl.update()
      scene.background = new THREE.Color(
        colorControl.resolveBackgroundColor(stageConfig.backgroundColor),
      )
      renderer.render(scene, camera)
    })

    return () => {
      loop.stop()
      audioTriggerHandlerRef.current = null
      audioFrameHandlerRef.current = null
      socket.close()
      socketRef.current = null
      window.removeEventListener("resize", handleResize)
      activeCanvas.removeEventListener("pointerdown", handlePointerDown)
      activeCanvas.removeEventListener("pointermove", handlePointerMove)
      activeCanvas.removeEventListener("pointerup", handlePointerUp)
      activeCanvas.removeEventListener("pointercancel", handlePointerUp)
      colorControl.dispose()
      centerShape.dispose()
      ripplePaint.dispose()
      trailPaint.dispose()
      renderer.dispose()
    }
  }, [])

  return api
}
