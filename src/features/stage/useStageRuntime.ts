"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  getFrameAtTime,
} from "@/features/songs/songAnalysisLogic"
import type { SongAnalysis } from "@/features/songs/songTypes"
import { normalizeAudioControlledShapeSettings } from "@/features/shapeGenerator/shapeGeneratorTypes"
import { stageConfig } from "./stageConfig"
import {
  createStageRenderBridge,
  type StageRenderBridge,
} from "./render/stageRenderBridge"
import type { StageRenderViewport } from "./render/stageRenderProtocol"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

const idleSongTransport: SongTransportUpdateMessage = {
  type: "song_transport_update",
  state: "idle",
  timeMs: 0,
  durationMs: 0,
  timestamp: 0,
}

type PointerCanvas = {
  x: number
  y: number
}

export type StageAudioRouteConfig = {
  audioInstanceId: string
  settings: AudioCircleSettings
}

function getPointerCanvas(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): PointerCanvas {
  const rect = canvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height

  return { x, y }
}

function getStageViewport(canvas: HTMLCanvasElement): StageRenderViewport {
  return {
    width: Math.max(canvas.clientWidth || window.innerWidth, 1),
    height: Math.max(canvas.clientHeight || window.innerHeight, 1),
    pixelRatio: window.devicePixelRatio || 1,
  }
}

function createLocalPointerMessage({
  point,
  previousPoint,
  speed,
}: {
  point: PointerCanvas
  previousPoint: PointerCanvas | null
  speed: number
}): PointerMessage {
  return {
    type: "pointer",
    userId: "stage-local",
    userRole: "stage",
    x: point.x,
    y: point.y,
    vx: previousPoint ? point.x - previousPoint.x : 0,
    vy: previousPoint ? point.y - previousPoint.y : 0,
    speed,
    down: true,
    color: "#ffffff",
    visualMode: "circle",
    trailLineCount: 1,
    trailLength: 1,
    timestamp: performance.now(),
  }
}

export function useStageRuntime() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const renderBridgeRef = useRef<StageRenderBridge | null>(null)
  const audioRouteSettingsRef = useRef(new Map<string, AudioCircleSettings>())
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
    renderBridgeRef.current?.receiveAudioFrame(frame)

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
    renderBridgeRef.current?.resetVisualCvRouteStates()
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
    const renderBridge = createStageRenderBridge({
      canvas: activeCanvas,
      config: stageConfig,
      ...getStageViewport(activeCanvas),
      onError: (error) => {
        console.error(error)
      },
      onReady: (mode) => {
        console.info(`Stage renderer ready (${mode})`)
      },
    })
    let localPointerPrevious: PointerCanvas | null = null

    renderBridgeRef.current = renderBridge

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

      if (message.type === "pointer") {
        renderBridge.receivePointer(message)
      }

      if (message.type === "color_control") {
        renderBridge.receiveColorControl(message)
      }

      if (message.type === "clear_stage") {
        renderBridge.clear()
      }

      if (
        message.type === "audio_settings_snapshot" ||
        message.type === "audio_settings_update"
      ) {
        const normalizedSettings = {
          ...message.settings,
          centerShape: normalizeAudioControlledShapeSettings(
            message.settings.centerShape,
          ),
        }

        setAudioRoutes((currentRoutes) => {
          const nextRoute = {
            audioInstanceId: message.audioInstanceId,
            settings: normalizedSettings,
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
        renderBridge.receiveAudioSettings(message.audioInstanceId, normalizedSettings)
      }

      if (message.type === "audio_settings_delete") {
        setAudioRoutes((currentRoutes) =>
          currentRoutes.filter(
            (route) => route.audioInstanceId !== message.audioInstanceId,
          ),
        )
        songRouteStatesRef.current.delete(message.audioInstanceId)
        renderBridge.removeAudioInstance(message.audioInstanceId)
      }
    })

    function handleResize() {
      renderBridge.resize(getStageViewport(activeCanvas))
    }

    function handlePointerDown(event: PointerEvent) {
      activeCanvas.setPointerCapture(event.pointerId)
      const next = getPointerCanvas(event, activeCanvas)

      renderBridge.receivePointer(
        createLocalPointerMessage({
          point: next,
          previousPoint: localPointerPrevious,
          speed: 0,
        }),
      )
      localPointerPrevious = next
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.buttons === 0) {
        return
      }

      const next = getPointerCanvas(event, activeCanvas)
      const speed = localPointerPrevious
        ? Math.hypot(next.x - localPointerPrevious.x, next.y - localPointerPrevious.y) *
          20
        : 0

      renderBridge.receivePointer(
        createLocalPointerMessage({
          point: next,
          previousPoint: localPointerPrevious,
          speed,
        }),
      )
      localPointerPrevious = next
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

    return () => {
      socket.close()
      socketRef.current = null
      renderBridgeRef.current = null
      stopSongAnalysisLoop()
      songAudioRef.current?.pause()
      songAudioRef.current = null
      window.removeEventListener("resize", handleResize)
      activeCanvas.removeEventListener("pointerdown", handlePointerDown)
      activeCanvas.removeEventListener("pointermove", handlePointerMove)
      activeCanvas.removeEventListener("pointerup", handlePointerUp)
      activeCanvas.removeEventListener("pointercancel", handlePointerUp)
      renderBridge.dispose()
    }
  }, [])

  return api
}
