import type { AudioCircleSettings } from "../../network/protocolTypes"

export type SavedAudioPatch = {
  id: string
  name: string
  settings: AudioCircleSettings
  createdAt: string
  updatedAt: string
}

export type AudioPatchFile = {
  patches: SavedAudioPatch[]
}
