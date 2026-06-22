import type {
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "@/features/shapeGenerator/shapeGeneratorTypes"

export type SpiralMotionSettings = ShapeSpiralMotionSettings

export type SpiralMotionState = {
  elapsedMs: number
  phaseDegrees: number
  zOffset: number
  lastFrequencyHz: number
}

export type SpiralMotionTransform = {
  position: ShapeVector3
  phaseDegrees: number
  progress: number
  radius: number
  zOffset: number
  frequencyHz: number
}

export type SpiralMotionSample = {
  x: number
  y: number
  z: number
  progress: number
}
