"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createAudioAnalysisFrame } from "./audioAnalyserLogic"
import type {
  AudioAnalyserStatus,
  AudioAnalysisFrame,
} from "./audioAnalyserTypes"

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
}

export function useAudioAnalyser() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<AudioAnalyserStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [frame, setFrame] = useState<AudioAnalysisFrame | null>(null)

  const stop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

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
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      const frequencyData = new Uint8Array(analyser.frequencyBinCount)

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)
      streamRef.current = stream
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      setStatus("running")

      function tick() {
        analyser.getByteFrequencyData(frequencyData)
        setFrame(createAudioAnalysisFrame(frequencyData, performance.now()))
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
