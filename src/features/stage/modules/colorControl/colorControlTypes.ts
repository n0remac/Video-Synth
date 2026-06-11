import type {
  ColorControlMappingPreset,
  ColorControlSource,
  ColorControlTarget,
} from "@/features/network/protocolTypes"

export type HsvColor = {
  h: number
  s: number
  v: number
}

export type ColorControlInput = {
  userId: string
  source: ColorControlSource
  target: ColorControlTarget
  targetUserId?: string
  mapping: ColorControlMappingPreset
  x: number
  y: number
  baseColor: string
  amount: number
  timestamp: number
}

export type ColorControlOverride = ColorControlInput & {
  color: string
}

export type ColorControlState = {
  globalDrawColor: ColorControlOverride | null
  backgroundColor: ColorControlOverride | null
  userDrawColors: Record<string, ColorControlOverride>
}
