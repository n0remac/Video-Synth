"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createAudioAnalysisFrame } from "./audioAnalyserLogic"
import type {
  AudioAnalyserStatus,
  AudioAnalysisFrame,
} from "./audioAnalyserTypes"
import type { AudioCircleSettings } from "@/features/network/protocolTypes"
import {
  sampleSpectrumRange,
  updateAudioRouteSignalState,
} from "@/features/controller/audio/audioRoutingLogic"
import type { AudioRouteFollowerState } from "@/features/controller/audio/audioRoutingLogic"

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
}

export type AudioWorkletRouteConfig = {
  audioInstanceId: string
  settings: AudioCircleSettings
}

export type AudioWorkletTriggerEvent = {
  audioInstanceId: string
  color: string
  level: number
  riseAmount: number
  fallAmount: number
  timestamp: number
}

type AudioWorkletAnalysisMessage = {
  type: "analysis"
  frame: AudioAnalysisFrame
  triggers: AudioWorkletTriggerEvent[]
}

type UseAudioAnalyserOptions = {
  routes?: AudioWorkletRouteConfig[]
  onFrame?(frame: AudioAnalysisFrame): void
  onTrigger?(event: AudioWorkletTriggerEvent): void
}

export function useAudioAnalyser(options: UseAudioAnalyserOptions = {}) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const routesRef = useRef<AudioWorkletRouteConfig[]>(options.routes ?? [])
  const fallbackRouteStatesRef = useRef(new Map<string, AudioRouteFollowerState>())
  const onFrameRef = useRef<UseAudioAnalyserOptions["onFrame"]>(
    options.onFrame,
  )
  const onTriggerRef = useRef<UseAudioAnalyserOptions["onTrigger"]>(
    options.onTrigger,
  )
  const lastDisplayFrameAtRef = useRef(0)
  const [status, setStatus] = useState<AudioAnalyserStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<AudioAnalysisFrame | null>(null)

  useEffect(() => {
    routesRef.current = options.routes ?? []
    const routeIds = new Set(routesRef.current.map((route) => route.audioInstanceId))

    Array.from(fallbackRouteStatesRef.current.keys()).forEach((routeId) => {
      if (!routeIds.has(routeId)) {
        fallbackRouteStatesRef.current.delete(routeId)
      }
    })
    workletNodeRef.current?.port.postMessage({
      type: "routes",
      routes: routesRef.current,
    })
  }, [options.routes])

  useEffect(() => {
    onTriggerRef.current = options.onTrigger
  }, [options.onTrigger])

  useEffect(() => {
    onFrameRef.current = options.onFrame
  }, [options.onFrame])

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    workletNodeRef.current?.port.close()
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    lastDisplayFrameAtRef.current = 0
    fallbackRouteStatesRef.current.clear()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    void audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
    setStatus("idle")
  }, [])

  const start = useCallback(async () => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as WindowWithWebkitAudio).webkitAudioContext

    if (!AudioContextConstructor || !navigator.mediaDevices?.getUserMedia) {
      setStatus("not-supported")
      return
    }

    try {
      stop()
      setError(null)
      setStatus("requesting")

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      const audioContext = new AudioContextConstructor()
      const source = audioContext.createMediaStreamSource(stream)
      streamRef.current = stream
      audioContextRef.current = audioContext
      setStatus("running")

      if ("audioWorklet" in audioContext && audioContext.audioWorklet) {
        await audioContext.audioWorklet.addModule(
          "/worklets/audio-features-processor.js",
        )

        const workletNode = new AudioWorkletNode(
          audioContext,
          "signal-paint-audio-processor",
        )
        const mutedOutput = audioContext.createGain()

        mutedOutput.gain.value = 0
        workletNode.port.onmessage = (event) => {
          const message = event.data as AudioWorkletAnalysisMessage

          if (message?.type !== "analysis") {
            return
          }

          onFrameRef.current?.(message.frame)
          if (message.frame.timestamp - lastDisplayFrameAtRef.current >= 100) {
            lastDisplayFrameAtRef.current = message.frame.timestamp
            setFrame(message.frame)
          }
          message.triggers?.forEach((trigger) => {
            onTriggerRef.current?.(trigger)
          })
        }
        source.connect(workletNode)
        workletNode.connect(mutedOutput)
        mutedOutput.connect(audioContext.destination)
        workletNode.port.postMessage({
          type: "routes",
          routes: routesRef.current,
        })
        workletNodeRef.current = workletNode
        return
      }

      const analyser = audioContext.createAnalyser()
      const frequencyData = new Uint8Array(analyser.frequencyBinCount)

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)
      analyserRef.current = analyser

      function tick() {
        analyser.getByteFrequencyData(frequencyData)
        const timestamp = performance.now()
        const baseFrame = createAudioAnalysisFrame(frequencyData, timestamp)
        const routeSignals = routesRef.current.map((route) => {
          const rawLevel = sampleSpectrumRange(
            baseFrame.spectrum,
            route.settings.sampleStartPercent,
            route.settings.sampleEndPercent,
          )
          const result = updateAudioRouteSignalState({
            previousState:
              fallbackRouteStatesRef.current.get(route.audioInstanceId) ?? null,
            sampleValue: rawLevel,
            settings: route.settings,
            timestamp,
          })

          fallbackRouteStatesRef.current.set(route.audioInstanceId, result.follower)

          if (result.triggered) {
            onTriggerRef.current?.({
              audioInstanceId: route.audioInstanceId,
              color: route.settings.circleColor,
              level: result.level,
              riseAmount: result.riseAmount,
              fallAmount: result.fallAmount,
              timestamp,
            })
          }

          return {
            audioInstanceId: route.audioInstanceId,
            sampleStartPercent: route.settings.sampleStartPercent,
            sampleEndPercent: route.settings.sampleEndPercent,
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
        })

        const frame: AudioAnalysisFrame = {
          ...baseFrame,
          source: "analyser",
          routes: routeSignals,
        }

        onFrameRef.current?.(frame)
        if (timestamp - lastDisplayFrameAtRef.current >= 100) {
          lastDisplayFrameAtRef.current = timestamp
          setFrame(frame)
        }
        animationFrameRef.current = requestAnimationFrame(tick)
      }

      tick()
    } catch (caughtError) {
      setStatus("error")
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to start audio input.",
      )
    }
  }, [stop])

  useEffect(() => stop, [stop])

  return {
    status,
    error,
    frame,
    running: status === "running",
    start,
    stop,
  }
}
