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
  SongCommandMessage,
  SongTransportUpdateMessage,
} from "@/features/network/protocolTypes"
import { getVisualizerSocketUrl } from "@/features/network/protocol"
import {
  sampleSpectrumRange,
  updateAudioRouteSignalState,
} from "@/features/controller/audio/audioRoutingLogic"
import type { AudioRouteFollowerState } from "@/features/controller/audio/audioRoutingLogic"
import {
  defaultTriggeredCircleRouting,
  defaultVisualCvSettings,
} from "@/features/visualCv/visualCvDefaults"
import {
  createRoutedAudioRouteSignal,
  getVisualCvModulationValue,
  isVisualCvTriggerActive,
  updateVisualCvRouteSignal,
} from "@/features/visualCv/visualCvLogic"
import type { VisualCvRouteState } from "@/features/visualCv/visualCvLogic"
import {
  getFrameAtTime,
} from "@/features/songs/songAnalysisLogic"
import type { SongAnalysis } from "@/features/songs/songTypes"
import { stageConfig } from "./stageConfig"
import { createCamera, resizeCameraToViewport } from "./render/createCamera"
import { startAnimationLoop } from "./render/animationLoop"
import { createRenderer } from "./render/createRenderer"
import { createScene } from "./render/createScene"
import { ColorControlModule } from "./modules/colorControl"
import { CenterShapeModule } from "./modules/centerShape"
import { RipplePaintModule } from "./modules/ripplePaint"
import { SpiralMotionModule } from "./modules/spiralMotion"
import { TrailPaintModule } from "./modules/trailPaint"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

const idleSongTransport: SongTransportUpdateMessage = {
  type: "song_transport_update",
  state: "idle",
  timeMs: 0,
  durationMs: 0,
  timestamp: 0,
}

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
  const audioFrameHandlerRef = useRef<((frame: AudioAnalysisFrame) => void) | null>(
    null,
  )
  const audioRouteSettingsRef = useRef(new Map<string, AudioCircleSettings>())
  const visualCvRouteStatesRef = useRef(new Map<string, VisualCvRouteState>())
  const songAnalysisRef = useRef<SongAnalysis | null>(null)
  const songAudioRef = useRef<HTMLAudioElement | null>(null)
  const songAnimationFrameRef = useRef<number | null>(null)
  const songRouteStatesRef = useRef(new Map<string, AudioRouteFollowerState>())
  const songCommandHandlerRef = useRef<
    ((message: SongCommandMessage) => void) | null
  >(null)
  const lastSongTransportUpdateAtRef = useRef(0)
  const songSequenceRef = useRef(0)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting")
  const [audioRoutes, setAudioRoutes] = useState<StageAudioRouteConfig[]>([])
  const [songTransport, setSongTransport] =
    useState<SongTransportUpdateMessage>(idleSongTransport)

  const sendAudioFrame = useCallback((frame: AudioAnalysisFrame) => {
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
  }, [])

  const publishSongTransport = useCallback(
    (update: Omit<SongTransportUpdateMessage, "type" | "timestamp">) => {
      const message: SongTransportUpdateMessage = {
        type: "song_transport_update",
        ...update,
        timestamp: Date.now(),
      }

      setSongTransport(message)

      const socket = socketRef.current

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message))
      }
    },
    [],
  )

  const stopSongAnalysisLoop = useCallback(() => {
    if (songAnimationFrameRef.current !== null) {
      cancelAnimationFrame(songAnimationFrameRef.current)
      songAnimationFrameRef.current = null
    }
  }, [])

  const resetSongRouteState = useCallback(() => {
    songRouteStatesRef.current.clear()
    visualCvRouteStatesRef.current.clear()
    songSequenceRef.current = 0
  }, [])

  const emitSongFrame = useCallback(() => {
    const audio = songAudioRef.current
    const analysis = songAnalysisRef.current

    if (!audio || !analysis || audio.paused || audio.ended) {
      return
    }

    const timeMs = audio.currentTime * 1000
    const analysisFrame = getFrameAtTime(analysis, timeMs)

    if (analysisFrame) {
      const routes: AudioRouteSignal[] = []

      audioRouteSettingsRef.current.forEach((settings, audioInstanceId) => {
        const rawLevel = sampleSpectrumRange(
          analysisFrame.controlSpectrum,
          settings.sampleStartPercent,
          settings.sampleEndPercent,
        )
        const result = updateAudioRouteSignalState({
          previousState:
            songRouteStatesRef.current.get(audioInstanceId) ?? null,
          sampleValue: rawLevel,
          settings,
          timestamp: timeMs,
        })

        songRouteStatesRef.current.set(audioInstanceId, result.follower)

        const routeSignal = {
          audioInstanceId,
          sampleStartPercent: settings.sampleStartPercent,
          sampleEndPercent: settings.sampleEndPercent,
          level: result.level,
          fastLevel: result.fastLevel,
          slowLevel: result.slowLevel,
          floor: result.floor,
          peak: result.peak,
          riseAmount: result.riseAmount,
          fallAmount: result.fallAmount,
          riseRate: result.riseRate,
          fallRate: result.fallRate,
          triggered: result.triggered,
        }

        routes.push(routeSignal)
      })

      const frame: AudioAnalysisFrame = {
        volume: analysisFrame.volume,
        low: analysisFrame.low,
        mid: analysisFrame.mid,
        high: analysisFrame.high,
        dominantBin: analysisFrame.dominantBin,
        spectrum: analysisFrame.spectrum,
        source: "song",
        sequence: songSequenceRef.current,
        analysisRateHz: analysis.analysisRateHz,
        routes,
        timestamp: timeMs,
      }

      songSequenceRef.current += 1
      sendAudioFrame(frame)
    }

    if (timeMs - lastSongTransportUpdateAtRef.current >= 250) {
      lastSongTransportUpdateAtRef.current = timeMs
      publishSongTransport({
        songId: analysis.songId,
        state: "playing",
        timeMs,
        durationMs: analysis.durationMs,
      })
    }

    songAnimationFrameRef.current = requestAnimationFrame(emitSongFrame)
  }, [publishSongTransport, sendAudioFrame])

  const stopSong = useCallback(() => {
    stopSongAnalysisLoop()
    songAudioRef.current?.pause()
    if (songAudioRef.current) {
      songAudioRef.current.currentTime = 0
    }
    resetSongRouteState()
    publishSongTransport({
      state: "idle",
      timeMs: 0,
      durationMs: songAnalysisRef.current?.durationMs ?? 0,
    })
  }, [publishSongTransport, resetSongRouteState, stopSongAnalysisLoop])

  const loadSong = useCallback(
    async (songId: string, playAfterLoad: boolean, startTimeMs?: number) => {
      stopSongAnalysisLoop()
      resetSongRouteState()
      publishSongTransport({
        songId,
        state: "loading",
        timeMs: startTimeMs ?? 0,
        durationMs: 0,
      })

      try {
        const response = await fetch(`/api/songs/${songId}/analysis`, {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error("Song analysis is missing. Scan the song first.")
        }

        const analysis = (await response.json()) as SongAnalysis
        const audio = songAudioRef.current ?? new Audio()
        songAudioRef.current = audio
        audio.src = `/api/songs/${songId}/audio`
        audio.preload = "auto"
        audio.currentTime = Math.max(0, (startTimeMs ?? 0) / 1000)
        audio.onended = () => {
          stopSongAnalysisLoop()
          resetSongRouteState()
          publishSongTransport({
            songId,
            state: "ended",
            timeMs: analysis.durationMs,
            durationMs: analysis.durationMs,
          })
        }

        songAnalysisRef.current = analysis
        publishSongTransport({
          songId,
          state: "ready",
          timeMs: audio.currentTime * 1000,
          durationMs: analysis.durationMs,
        })

        if (playAfterLoad) {
          await audio.play()
          publishSongTransport({
            songId,
            state: "playing",
            timeMs: audio.currentTime * 1000,
            durationMs: analysis.durationMs,
          })
          songAnimationFrameRef.current = requestAnimationFrame(emitSongFrame)
        }
      } catch (error) {
        publishSongTransport({
          songId,
          state: "error",
          timeMs: 0,
          durationMs: 0,
          error:
            error instanceof Error ? error.message : "Unable to load song.",
        })
      }
    },
    [
      emitSongFrame,
      publishSongTransport,
      resetSongRouteState,
      stopSongAnalysisLoop,
    ],
  )

  const handleSongCommand = useCallback(
    (message: SongCommandMessage) => {
      const audio = songAudioRef.current
      const analysis = songAnalysisRef.current

      if (message.command === "load" && message.songId) {
        void loadSong(message.songId, false, message.timeMs)
        return
      }

      if (message.command === "play" && message.songId) {
        if (analysis?.songId === message.songId && audio) {
          if (message.timeMs !== undefined) {
            audio.currentTime = message.timeMs / 1000
            resetSongRouteState()
          }
          void audio
            .play()
            .then(() => {
              publishSongTransport({
                songId: message.songId,
                state: "playing",
                timeMs: audio.currentTime * 1000,
                durationMs: analysis.durationMs,
              })
              stopSongAnalysisLoop()
              songAnimationFrameRef.current = requestAnimationFrame(emitSongFrame)
            })
            .catch((error) => {
              publishSongTransport({
                songId: message.songId,
                state: "error",
                timeMs: audio.currentTime * 1000,
                durationMs: analysis.durationMs,
                error:
                  error instanceof Error ? error.message : "Unable to play song.",
              })
            })
          return
        }

        void loadSong(message.songId, true, message.timeMs)
        return
      }

      if (message.command === "pause") {
        audio?.pause()
        stopSongAnalysisLoop()
        publishSongTransport({
          songId: analysis?.songId,
          state: "paused",
          timeMs: audio ? audio.currentTime * 1000 : 0,
          durationMs: analysis?.durationMs ?? 0,
        })
        return
      }

      if (message.command === "seek" && audio && analysis) {
        audio.currentTime = (message.timeMs ?? 0) / 1000
        resetSongRouteState()
        publishSongTransport({
          songId: analysis.songId,
          state: audio.paused ? "paused" : "playing",
          timeMs: audio.currentTime * 1000,
          durationMs: analysis.durationMs,
        })

        if (!audio.paused && songAnimationFrameRef.current === null) {
          songAnimationFrameRef.current = requestAnimationFrame(emitSongFrame)
        }
        return
      }

      if (message.command === "stop") {
        stopSong()
      }
    },
    [
      emitSongFrame,
      loadSong,
      publishSongTransport,
      resetSongRouteState,
      stopSong,
      stopSongAnalysisLoop,
    ],
  )

  const api = useMemo(
    () => ({
      audioRoutes,
      canvasRef,
      connectionStatus,
      sendAudioFrame,
      songTransport,
      stopSong,
    }),
    [
      audioRoutes,
      connectionStatus,
      sendAudioFrame,
      songTransport,
      stopSong,
    ],
  )

  useEffect(() => {
    audioRouteSettingsRef.current = new Map(
      audioRoutes.map((route) => [route.audioInstanceId, route.settings]),
    )
  }, [audioRoutes])

  useEffect(() => {
    songCommandHandlerRef.current = handleSongCommand
  }, [handleSongCommand])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const activeCanvas = canvas
    const renderer = createRenderer(activeCanvas)
    const scene = createScene()
    scene.background = new THREE.Color(stageConfig.backgroundColor)
    const camera = createCamera(stageConfig.worldHeight)
    const colorControl = new ColorControlModule()
    const spiralMotion = new SpiralMotionModule({ scene })
    const centerShape = new CenterShapeModule({ scene, spiralMotion })
    const ripplePaint = new RipplePaintModule({
      scene,
      maxRipples: stageConfig.maxRipples,
    })
    const trailPaint = new TrailPaintModule({ scene })
    const world = resizeCameraToViewport(camera, stageConfig.worldHeight)
    let localPointerPrevious: PointerWorld | null = null

    audioFrameHandlerRef.current = (frame) => {
      frame.routes?.forEach((routeSignal: AudioRouteSignal) => {
        const settings = audioRouteSettingsRef.current.get(
          routeSignal.audioInstanceId,
        )

        if (!settings) {
          return
        }

        const visualCvResult = updateVisualCvRouteSignal({
          routeSignal,
          settings: settings.visualCv ?? defaultVisualCvSettings,
          state:
            visualCvRouteStatesRef.current.get(routeSignal.audioInstanceId) ??
            null,
          timestamp: frame.timestamp,
        })
        const visualCvSignal = visualCvResult.signal
        const circleRouting =
          settings.triggeredCircles ?? defaultTriggeredCircleRouting
        const routedRouteSignal = createRoutedAudioRouteSignal({
          routeSignal,
          routing: circleRouting,
          visualCvSignal,
        })

        visualCvRouteStatesRef.current.set(
          routeSignal.audioInstanceId,
          visualCvResult.state,
        )
        spiralMotion.receiveVisualCvRouteSignal(visualCvSignal)
        centerShape.receiveVisualCvRouteSignal(visualCvSignal)
        ripplePaint.receiveAudioRouteSignal(routedRouteSignal)

        if (!isVisualCvTriggerActive(visualCvSignal, circleRouting.triggerSource)) {
          return
        }

        const level = getVisualCvModulationValue(
          visualCvSignal,
          circleRouting.sizeSource,
        )
        const riseAmount = getVisualCvModulationValue(
          visualCvSignal,
          circleRouting.growSource,
        )
        const fallAmount = getVisualCvModulationValue(
          visualCvSignal,
          circleRouting.releaseSource,
        )
        const hasAudioMotion =
          settings.circleGrowOnRise === true ||
          settings.circleFadeOnFall === true ||
          settings.circleShrinkOnFall === true ||
          settings.circleLevelControlsSize === true

        ripplePaint.receiveInput({
          id: `audio-${routeSignal.audioInstanceId}-${frame.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
          userId: routeSignal.audioInstanceId,
          x: (Math.random() - 0.5) * world.worldWidth,
          y: (0.5 - Math.random()) * world.worldHeight,
          speed: level * 4,
          color: settings.circleColor,
          audioMotion: hasAudioMotion
            ? {
                audioInstanceId: routeSignal.audioInstanceId,
                growOnRise: settings.circleGrowOnRise,
                fadeOnFall: settings.circleFadeOnFall,
                shrinkOnFall: settings.circleShrinkOnFall,
                levelControlsSize: settings.circleLevelControlsSize,
                level,
                riseAmount,
                fallAmount,
              }
            : undefined,
        })
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

      if (message.type === "song_command") {
        songCommandHandlerRef.current?.(message)
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
        spiralMotion.receiveAudioSettings(
          message.audioInstanceId,
          message.settings,
        )
        centerShape.receiveAudioSettings(message.audioInstanceId, message.settings)
        visualCvRouteStatesRef.current.delete(message.audioInstanceId)
      }

      if (message.type === "audio_settings_delete") {
        setAudioRoutes((currentRoutes) =>
          currentRoutes.filter(
            (route) => route.audioInstanceId !== message.audioInstanceId,
          ),
        )
        songRouteStatesRef.current.delete(message.audioInstanceId)
        visualCvRouteStatesRef.current.delete(message.audioInstanceId)
        spiralMotion.removeAudioInstance(message.audioInstanceId)
        centerShape.removeAudioInstance(message.audioInstanceId)
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
      spiralMotion.update(dt)
      centerShape.update(dt)
      colorControl.update()
      scene.background = new THREE.Color(
        colorControl.resolveBackgroundColor(stageConfig.backgroundColor),
      )
      renderer.render(scene, camera)
    })

    return () => {
      loop.stop()
      audioFrameHandlerRef.current = null
      socket.close()
      socketRef.current = null
      stopSongAnalysisLoop()
      songAudioRef.current?.pause()
      songAudioRef.current = null
      window.removeEventListener("resize", handleResize)
      activeCanvas.removeEventListener("pointerdown", handlePointerDown)
      activeCanvas.removeEventListener("pointermove", handlePointerMove)
      activeCanvas.removeEventListener("pointerup", handlePointerUp)
      activeCanvas.removeEventListener("pointercancel", handlePointerUp)
      colorControl.dispose()
      centerShape.dispose()
      spiralMotion.dispose()
      ripplePaint.dispose()
      trailPaint.dispose()
      renderer.dispose()
    }
  }, [])

  return api
}
