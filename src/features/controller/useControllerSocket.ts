"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getVisualizerSocketUrl } from "@/features/network/protocol"
import { parseVisualizerMessage } from "@/features/network/messageValidation"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  AudioSettingsUpdateMessage,
  ColorControlMessage,
  ClearStageMessage,
  PointerMessage,
  VisualizerUserSummary,
} from "@/features/network/protocolTypes"

type SocketStatus = "connecting" | "connected" | "disconnected"

export function useControllerSocket(
  role: "controller" | "color" | "audio" = "controller",
) {
  const socketRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const [userId, setUserId] = useState("pending")
  const [assignedColor, setAssignedColor] = useState("#ff2d75")
  const [users, setUsers] = useState<VisualizerUserSummary[]>([])
  const [audioSettings, setAudioSettings] =
    useState<AudioCircleSettings | null>(null)
  const [stageAudioFrame, setStageAudioFrame] =
    useState<AudioAnalysisFrame | null>(null)

  useEffect(() => {
    const socket = new WebSocket(getVisualizerSocketUrl(role))
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
              { userId: message.userId, color: message.color },
            ]
          })
        }
      }

      if (message?.type === "users_snapshot") {
        setUsers(message.users)
      }

      if (message?.type === "audio_settings_snapshot") {
        setAudioSettings(message.settings)
      }

      if (message?.type === "audio_settings_update") {
        setAudioSettings(message.settings)
      }

      if (message?.type === "stage_audio_frame") {
        setStageAudioFrame(message.frame)
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
  }, [role])

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

  return {
    status,
    connected: status === "connected",
    userId,
    assignedColor,
    users,
    audioSettings,
    stageAudioFrame,
    sendPointer,
    sendColorControl,
    sendAudioSettingsUpdate,
    clearStage,
  }
}
