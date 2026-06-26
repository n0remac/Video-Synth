"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getAudioInputDeviceOptions,
  liveAudioInputDeviceStorageKey,
  resolveSelectedAudioInputDeviceId,
  systemAudioInputDeviceId,
  type AudioInputDeviceOption,
} from "./audioInputDevices"

export type AudioInputDevicesStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "not-supported"

function getStoredAudioInputDeviceId() {
  try {
    return window.localStorage.getItem(liveAudioInputDeviceStorageKey)
  } catch {
    return null
  }
}

function storeAudioInputDeviceId(deviceId: string) {
  try {
    if (deviceId === systemAudioInputDeviceId) {
      window.localStorage.removeItem(liveAudioInputDeviceStorageKey)
      return
    }

    window.localStorage.setItem(liveAudioInputDeviceStorageKey, deviceId)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function useAudioInputDevices() {
  const [deviceOptions, setDeviceOptions] = useState<AudioInputDeviceOption[]>(
    () => getAudioInputDeviceOptions([]),
  )
  const [selectedDeviceId, setSelectedDeviceIdState] = useState(
    systemAudioInputDeviceId,
  )
  const [status, setStatus] = useState<AudioInputDevicesStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const deviceOptionsRef = useRef(deviceOptions)
  const selectedDeviceIdRef = useRef(selectedDeviceId)

  const updateSelectedDeviceId = useCallback(
    (deviceId: string, options = deviceOptionsRef.current) => {
      const nextDeviceId = resolveSelectedAudioInputDeviceId(options, deviceId)

      selectedDeviceIdRef.current = nextDeviceId
      setSelectedDeviceIdState(nextDeviceId)
      storeAudioInputDeviceId(nextDeviceId)
    },
    [],
  )

  const refresh = useCallback(
    async (preferredDeviceId = selectedDeviceIdRef.current) => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        const defaultOptions = getAudioInputDeviceOptions([])

        setStatus("not-supported")
        setError(null)
        deviceOptionsRef.current = defaultOptions
        setDeviceOptions(defaultOptions)
        updateSelectedDeviceId(systemAudioInputDeviceId, defaultOptions)
        return
      }

      try {
        setStatus("loading")
        setError(null)

        const devices = await navigator.mediaDevices.enumerateDevices()
        const nextOptions = getAudioInputDeviceOptions(devices)
        const nextSelectedDeviceId = resolveSelectedAudioInputDeviceId(
          nextOptions,
          preferredDeviceId,
        )

        deviceOptionsRef.current = nextOptions
        setDeviceOptions(nextOptions)
        updateSelectedDeviceId(nextSelectedDeviceId, nextOptions)
        setStatus("ready")
      } catch (caughtError) {
        setStatus("error")
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to list audio input devices.",
        )
      }
    },
    [updateSelectedDeviceId],
  )

  const setSelectedDeviceId = useCallback(
    (deviceId: string) => {
      updateSelectedDeviceId(deviceId)
    },
    [updateSelectedDeviceId],
  )

  useEffect(() => {
    const storedDeviceId = getStoredAudioInputDeviceId()

    if (storedDeviceId) {
      selectedDeviceIdRef.current = storedDeviceId
      setSelectedDeviceIdState(storedDeviceId)
    }

    void refresh(storedDeviceId ?? systemAudioInputDeviceId)

    if (!navigator.mediaDevices?.addEventListener) {
      return
    }

    const handleDeviceChange = () => {
      void refresh(selectedDeviceIdRef.current)
    }

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      )
    }
  }, [refresh])

  return {
    deviceOptions,
    error,
    refresh,
    selectedDeviceId,
    setSelectedDeviceId,
    status,
  }
}
