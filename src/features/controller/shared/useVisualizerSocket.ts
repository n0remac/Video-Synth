"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getVisualizerSocketUrl } from "@/features/network/protocol"
import { parseVisualizerMessage } from "@/features/network/messageValidation"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  AudioInstanceSummary,
  AudioSettingsDeleteMessage,
  AudioSettingsUpdateMessage,
  ColorControlMessage,
  ClearStageMessage,
  PointerMessage,
  SongCommandMessage,
  SongTransportUpdateMessage,
  VisualizerClientRole,
  VisualizerUserSummary,
  WledSyncSnapshotMessage,
  WledSyncTestMessage,
  WledSyncUpdateMessage,
} from "@/features/network/protocolTypes"

type SocketStatus = "connecting" | "connected" | "disconnected"

type VisualizerSocketOptions = {
  audioInstanceId?: string
  onStageAudioFrame?(frame: AudioAnalysisFrame): void
}

export function useVisualizerSocket(
  role: VisualizerClientRole = "controller",
  options: VisualizerSocketOptions = {},
) {
  const socketRef = useRef<WebSocket | null>(null)
  const audioInstanceId = options.audioInstanceId ?? "default"
  const onStageAudioFrameRef = useRef(options.onStageAudioFrame)
  const lastStageAudioFrameStateAtRef = useRef(0)
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const [userId, setUserId] = useState("pending")
  const [assignedColor, setAssignedColor] = useState("#ff2d75")
  const [users, setUsers] = useState<VisualizerUserSummary[]>([])
  const [audioSettings, setAudioSettings] =
    useState<AudioCircleSettings | null>(null)
  const [audioSettingsByInstance, setAudioSettingsByInstance] = useState<
    Record<string, AudioCircleSettings>
  >({})
  const [audioInstances, setAudioInstances] = useState<AudioInstanceSummary[]>([])
  const [stageAudioFrame, setStageAudioFrame] =
    useState<AudioAnalysisFrame | null>(null)
  const [songTransport, setSongTransport] =
    useState<SongTransportUpdateMessage | null>(null)
  const [wledSync, setWledSync] =
    useState<WledSyncSnapshotMessage | null>(null)

  useEffect(() => {
    onStageAudioFrameRef.current = options.onStageAudioFrame
  }, [options.onStageAudioFrame])

  useEffect(() => {
    const socket = new WebSocket(
      getVisualizerSocketUrl(role, { audioInstanceId }),
    )
    socketRef.current = socket
    let ownUserId = "pending"
    setStatus("connecting")

    socket.addEventListener("open", () => {
      setStatus("connected")
    })

    socket.addEventListener("close", () => {
      setStatus("disconnected")
    })

    socket.addEventListener("error", () => {
      setStatus("disconnected")
    })

    socket.addEventListener("message", (event) => {
      const message = parseVisualizerMessage(String(event.data))

      if (message?.type === "user_joined") {
        const isOwnAssignment = ownUserId === "pending"

        if (isOwnAssignment) {
          ownUserId = message.userId
        }

        setUserId((currentUserId) => {
          if (currentUserId === "pending") {
            setAssignedColor(message.color)
            return message.userId
          }

          return currentUserId
        })

        if (role === "controller" || !isOwnAssignment) {
          setUsers((currentUsers) => {
            if (currentUsers.some((user) => user.userId === message.userId)) {
              return currentUsers
            }

            return [
              ...currentUsers,
              {
                userId: message.userId,
                color: message.color,
                role: message.role === "audio" ? "audio" : "controller",
              },
            ]
          })
        }
      }

      if (message?.type === "users_snapshot") {
        setUsers(message.users)
      }

      if (message?.type === "audio_settings_snapshot") {
        setAudioSettingsByInstance((currentSettings) => ({
          ...currentSettings,
          [message.audioInstanceId]: message.settings,
        }))

        if (message.audioInstanceId === audioInstanceId) {
          setAudioSettings(message.settings)
        }
      }

      if (message?.type === "audio_settings_update") {
        setAudioSettingsByInstance((currentSettings) => ({
          ...currentSettings,
          [message.audioInstanceId]: message.settings,
        }))

        if (message.audioInstanceId === audioInstanceId) {
          setAudioSettings(message.settings)
        }
      }

      if (message?.type === "audio_instances_snapshot") {
        setAudioInstances(message.instances)
      }

      if (message?.type === "audio_settings_delete") {
        setAudioInstances((currentInstances) =>
          currentInstances.filter(
            (instance) => instance.audioInstanceId !== message.audioInstanceId,
          ),
        )
        setAudioSettingsByInstance((currentSettings) => {
          const nextSettings = { ...currentSettings }

          delete nextSettings[message.audioInstanceId]

          return nextSettings
        })

        if (message.audioInstanceId === audioInstanceId) {
          setAudioSettings(null)
        }
      }

      if (message?.type === "stage_audio_frame") {
        onStageAudioFrameRef.current?.(message.frame)

        if (
          lastStageAudioFrameStateAtRef.current === 0 ||
          message.frame.timestamp < lastStageAudioFrameStateAtRef.current ||
          message.frame.timestamp - lastStageAudioFrameStateAtRef.current >= 100
        ) {
          lastStageAudioFrameStateAtRef.current = message.frame.timestamp
          setStageAudioFrame(message.frame)
        }
      }

      if (message?.type === "song_transport_update") {
        setSongTransport(message)
      }

      if (message?.type === "wled_sync_snapshot") {
        setWledSync(message)
      }

      if (message?.type === "user_left") {
        setUsers((currentUsers) =>
          currentUsers.filter((user) => user.userId !== message.userId),
        )
      }
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [audioInstanceId, role])

  const sendPointer = useCallback((message: PointerMessage) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify(message))
  }, [])

  const sendColorControl = useCallback((message: ColorControlMessage) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify(message))
  }, [])

  const sendAudioSettingsUpdate = useCallback(
    (message: AudioSettingsUpdateMessage) => {
      const socket = socketRef.current

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify(message))
    },
    [],
  )

  const sendAudioSettingsDelete = useCallback(
    (message: AudioSettingsDeleteMessage) => {
      const socket = socketRef.current

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify(message))
    },
    [],
  )

  const clearStage = useCallback(() => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    const message: ClearStageMessage = {
      type: "clear_stage",
      userId,
      timestamp: Date.now(),
    }

    socket.send(JSON.stringify(message))
  }, [userId])

  const sendSongCommand = useCallback((message: SongCommandMessage) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify(message))
  }, [])

  const sendWledSyncUpdate = useCallback(
    (message: WledSyncUpdateMessage) => {
      const socket = socketRef.current

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify(message))
    },
    [],
  )

  const sendWledSyncTest = useCallback((message: WledSyncTestMessage) => {
    const socket = socketRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send(JSON.stringify(message))
  }, [])

  return {
    status,
    connected: status === "connected",
    userId,
    assignedColor,
    users,
    audioSettings,
    audioSettingsByInstance,
    audioInstances,
    stageAudioFrame,
    songTransport,
    wledSync,
    sendPointer,
    sendColorControl,
    sendAudioSettingsUpdate,
    sendAudioSettingsDelete,
    sendSongCommand,
    sendWledSyncUpdate,
    sendWledSyncTest,
    clearStage,
  }
}
