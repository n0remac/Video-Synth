import type {
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "@/features/shapeGenerator/shapeGeneratorTypes"
import type { SpiralMotionInstanceTransform } from "../spiralMotion/spiralMotionTypes"
import { getSpiralPathDurationMs } from "../spiralMotion/spiralMotionLogic.ts"

export type CenterShapePositionModeTransitionDirection =
  | "manual-to-spiral"
  | "spiral-to-manual"

export type CenterShapeTransitionPoint = {
  id: string
  pathIndex: number
  from: ShapeVector3
  phaseDegrees: number
  pulsesSinceBirth: number
}

type BaseCenterShapePositionModeTransition = {
  audioInstanceId: string
  direction: CenterShapePositionModeTransitionDirection
  elapsedMs: number
  settings: ShapeSpiralMotionSettings
}

export type ManualToSpiralTransition =
  BaseCenterShapePositionModeTransition & {
    direction: "manual-to-spiral"
    origin: ShapeVector3
  }

export type SpiralToManualTransition =
  BaseCenterShapePositionModeTransition & {
    direction: "spiral-to-manual"
    points: CenterShapeTransitionPoint[]
  }

export type CenterShapePositionModeTransition =
  | ManualToSpiralTransition
  | SpiralToManualTransition

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1)

  return t * t * (3 - 2 * t)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function lerpVector3(from: ShapeVector3, to: ShapeVector3, amount: number) {
  return {
    x: lerp(from.x, to.x, amount),
    y: lerp(from.y, to.y, amount),
    z: lerp(from.z, to.z, amount),
  }
}

function toRadians(degrees: number) {
  return (degrees / 180) * Math.PI
}

function getDirectionSign(direction: ShapeSpiralMotionSettings["direction"]) {
  return direction === "clockwise" ? -1 : 1
}

export function getCenterShapeTransitionProgress({
  elapsedMs,
  settings,
}: {
  elapsedMs: number
  settings: ShapeSpiralMotionSettings
}) {
  return clamp(elapsedMs / getSpiralPathDurationMs(settings), 0, 1)
}

export function advanceCenterShapeTransition({
  dt,
  transition,
}: {
  dt: number
  transition: CenterShapePositionModeTransition
}) {
  const elapsedMs = transition.elapsedMs + Math.max(dt, 0) * 1000
  const progress = getCenterShapeTransitionProgress({
    elapsedMs,
    settings: transition.settings,
  })

  return {
    transition: {
      ...transition,
      elapsedMs,
    },
    done: progress >= 1,
    progress,
  }
}

export function createManualToSpiralTransition({
  audioInstanceId,
  origin,
  settings,
}: {
  audioInstanceId: string
  origin: ShapeVector3
  settings: ShapeSpiralMotionSettings
}): ManualToSpiralTransition {
  return {
    audioInstanceId,
    direction: "manual-to-spiral",
    elapsedMs: 0,
    origin: { ...origin },
    settings: { ...settings },
  }
}

export function createSpiralToManualTransition({
  audioInstanceId,
  settings,
  startTransforms,
}: {
  audioInstanceId: string
  settings: ShapeSpiralMotionSettings
  startTransforms: SpiralMotionInstanceTransform[]
}): SpiralToManualTransition {
  return {
    audioInstanceId,
    direction: "spiral-to-manual",
    elapsedMs: 0,
    points: startTransforms.map((transform) => ({
      id: transform.id,
      pathIndex: transform.pathIndex,
      from: { ...transform.position },
      phaseDegrees: transform.phaseDegrees,
      pulsesSinceBirth: transform.pulsesSinceBirth,
    })),
    settings: { ...settings },
  }
}

export function getManualToSpiralTransitionTransforms({
  progress,
  targetTransforms,
  transition,
}: {
  progress: number
  targetTransforms: SpiralMotionInstanceTransform[]
  transition: ManualToSpiralTransition
}): SpiralMotionInstanceTransform[] {
  const easedProgress = smoothstep(progress)

  return targetTransforms.map((transform) => ({
    ...transform,
    position: lerpVector3(
      transition.origin,
      transform.position,
      easedProgress,
    ),
    progress,
  }))
}

export function getSpiralToManualTransitionTransforms({
  progress,
  targetOrigin,
  transition,
}: {
  progress: number
  targetOrigin: ShapeVector3
  transition: SpiralToManualTransition
}): SpiralMotionInstanceTransform[] {
  const easedProgress = smoothstep(progress)
  const effectivePulses = transition.elapsedMs / 1000
  const phaseAdvanceRadians = toRadians(
    getDirectionSign(transition.settings.direction) *
      transition.settings.degreesPerPulse *
      effectivePulses,
  )

  return transition.points.map((point) => ({
    id: point.id,
    pathIndex: point.pathIndex,
    position: getSpiralCollapsePosition({
      phaseAdvanceRadians,
      point,
      progress: easedProgress,
      targetOrigin,
    }),
    phaseDegrees:
      point.phaseDegrees +
      getDirectionSign(transition.settings.direction) *
        transition.settings.degreesPerPulse *
        effectivePulses,
    progress,
    pulsesSinceBirth: point.pulsesSinceBirth + effectivePulses,
  }))
}

function getSpiralCollapsePosition({
  phaseAdvanceRadians,
  point,
  progress,
  targetOrigin,
}: {
  phaseAdvanceRadians: number
  point: CenterShapeTransitionPoint
  progress: number
  targetOrigin: ShapeVector3
}) {
  const offsetX = point.from.x - targetOrigin.x
  const offsetY = point.from.y - targetOrigin.y
  const startRadius = Math.hypot(offsetX, offsetY)
  const angle = Math.atan2(offsetY, offsetX) + phaseAdvanceRadians
  const radius = startRadius * (1 - progress)

  return {
    x: targetOrigin.x + Math.cos(angle) * radius,
    y: targetOrigin.y + Math.sin(angle) * radius,
    z: lerp(point.from.z, targetOrigin.z, progress),
  }
}
