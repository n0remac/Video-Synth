import type {
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "@/features/shapeGenerator/shapeGeneratorTypes"

export type SpiralMotionSettings = ShapeSpiralMotionSettings

export type SpiralMotionInstance = {
  id: string
  pathIndex: number
  ageMs: number
  bornAtPulse: number
}

export type SpiralMotionRuntimeState = {
  instances: SpiralMotionInstance[]
  spawnElapsedMs: number
  accumulatedPulse: number
  lastFrequencyHz: number
  nextInstanceId: number
  hasSpawnedInitialRing: boolean
}

export type SpiralMotionWorldSize = {
  worldWidth: number
  worldHeight: number
}

export type SpiralMotionInstanceTransform = {
  id: string
  pathIndex: number
  position: ShapeVector3
  phaseDegrees: number
  progress: number
  pulsesSinceBirth: number
}

export type SpiralMotionUpdateResult = {
  state: SpiralMotionRuntimeState
  spawned: boolean
}

export type SpiralMotionSample = {
  x: number
  y: number
  z: number
  progress: number
}

export type SpiralMotionPathSample = {
  pathIndex: number
  samples: SpiralMotionSample[]
}
