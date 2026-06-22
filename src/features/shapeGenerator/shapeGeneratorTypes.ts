import type { VisualCvModulationSource } from "@/features/visualCv/visualCvTypes"

export type ShapeMode = "2d" | "3d"

export type ShapeFamily =
  | "prism"
  | "pyramid"
  | "sphere"
  | "polyhedron"

export type ShapeParameters = {
  angleBias: number
  bevel: number
  depth: number
  sideVariation: number
  sides: number
  size: number
  taper: number
  twist: number
}

export type ShapeParameterName = keyof ShapeParameters

export type ShapeVector3 = {
  x: number
  y: number
  z: number
}

export type ShapeTransformControlName =
  | "positionX"
  | "positionY"
  | "positionZ"
  | "rotationX"
  | "rotationY"
  | "rotationZ"
  | "colorHue"

export type ShapeControlName = ShapeParameterName | ShapeTransformControlName

export type ShapeMotionSource =
  | "level"
  | "rise-fall"
  | "motion"
  | "smooth"
  | "envelope"
  | "syncSine"

export type ShapeMotionMode = "oscillate" | "continuous"

export type ShapeMotionMapping = {
  enabled: boolean
  source: ShapeMotionSource
  amount: number
  invert: boolean
  mode: ShapeMotionMode
  resetMs: number
}

export type ShapePositionMode = "manual" | "spiral"

export type ShapeSpiralMotionDirection = "clockwise" | "counterclockwise"

export type ShapeSpiralMotionSettings = {
  enabled: boolean
  visualize: boolean
  startRadius: number
  radiusSource: VisualCvModulationSource
  radiusCvAmount: number
  moveSource: VisualCvModulationSource
  moveRate: number
  degreesPerPulse: number
  depthPerPulse: number
  pathDurationMs: number
  pathCount: number
  spawnSource: VisualCvModulationSource
  spawnRateHz: number
  maxActiveShapes: number
  edgePadding: number
  direction: ShapeSpiralMotionDirection
  startPhaseDegrees: number
  resetMs?: number
}

export type AudioControlledShapeSettings = {
  enabled: boolean
  mode: ShapeMode
  family: ShapeFamily
  color: string
  parameters: ShapeParameters
  positionMode: ShapePositionMode
  position: ShapeVector3
  rotation: ShapeVector3
  spiralMotion: ShapeSpiralMotionSettings
  motionMappings: Record<ShapeControlName, ShapeMotionMapping>
}

export const shapeFamilyOptions: Array<{ label: string; value: ShapeFamily }> = [
  { label: "Prism", value: "prism" },
  { label: "Pyramid", value: "pyramid" },
  { label: "Sphere", value: "sphere" },
  { label: "Polyhedron", value: "polyhedron" },
]

export const shapeParameterNames: ShapeParameterName[] = [
  "angleBias",
  "bevel",
  "depth",
  "sideVariation",
  "sides",
  "size",
  "taper",
  "twist",
]

export const shapeControlNames: ShapeControlName[] = [
  ...shapeParameterNames,
  "positionX",
  "positionY",
  "positionZ",
  "rotationX",
  "rotationY",
  "rotationZ",
  "colorHue",
]

export const defaultShapeParameters: ShapeParameters = {
  angleBias: 0,
  bevel: 0.04,
  depth: 1.1,
  sideVariation: 0,
  sides: 6,
  size: 1.7,
  taper: 1,
  twist: 0,
}

export const defaultShapeMotionMapping: ShapeMotionMapping = {
  enabled: false,
  source: "rise-fall",
  amount: 0,
  invert: false,
  mode: "oscillate",
  resetMs: 2000,
}

export const defaultShapeSpiralMotionSettings: ShapeSpiralMotionSettings = {
  enabled: false,
  visualize: true,
  startRadius: 1,
  radiusSource: "smooth",
  radiusCvAmount: 0.25,
  moveSource: "syncSine",
  moveRate: 1,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  pathDurationMs: 4000,
  pathCount: 8,
  spawnSource: "syncSine",
  spawnRateHz: 0.5,
  maxActiveShapes: 128,
  edgePadding: 0.06,
  direction: "clockwise",
  startPhaseDegrees: 0,
}

function clampSetting(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isVisualCvModulationSourceValue(
  value: unknown,
): value is VisualCvModulationSource {
  return (
    value === "level" ||
    value === "rise" ||
    value === "fall" ||
    value === "motion" ||
    value === "smooth" ||
    value === "envelope" ||
    value === "syncSine"
  )
}

function normalizeShapeVector3(
  value: unknown,
  fallback: ShapeVector3,
): ShapeVector3 {
  if (!isRecordValue(value)) {
    return fallback
  }

  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y,
    z: typeof value.z === "number" && Number.isFinite(value.z) ? value.z : fallback.z,
  }
}

export function normalizeShapeSpiralMotionSettings(
  value: unknown,
  fallback: ShapeSpiralMotionSettings = defaultShapeSpiralMotionSettings,
): ShapeSpiralMotionSettings {
  if (!isRecordValue(value)) {
    return { ...fallback }
  }

  const pathCount =
    typeof value.pathCount === "number" && Number.isFinite(value.pathCount)
      ? clampSetting(Math.round(value.pathCount), 1, 64)
      : fallback.pathCount
  const pathDurationMs =
    typeof value.pathDurationMs === "number" &&
    Number.isFinite(value.pathDurationMs)
      ? Math.max(value.pathDurationMs, 250)
      : typeof value.resetMs === "number" && Number.isFinite(value.resetMs)
        ? Math.max(value.resetMs, 250)
        : fallback.pathDurationMs
  const maxActiveShapes =
    typeof value.maxActiveShapes === "number" &&
    Number.isFinite(value.maxActiveShapes)
      ? clampSetting(Math.round(value.maxActiveShapes), pathCount, 512)
      : Math.max(fallback.maxActiveShapes, pathCount)

  return {
    enabled:
      typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    visualize:
      typeof value.visualize === "boolean"
        ? value.visualize
        : fallback.visualize,
    startRadius:
      typeof value.startRadius === "number" && Number.isFinite(value.startRadius)
        ? Math.max(value.startRadius, 0)
        : fallback.startRadius,
    radiusSource: isVisualCvModulationSourceValue(value.radiusSource)
      ? value.radiusSource
      : fallback.radiusSource,
    radiusCvAmount:
      typeof value.radiusCvAmount === "number" &&
      Number.isFinite(value.radiusCvAmount)
        ? Math.max(value.radiusCvAmount, 0)
        : fallback.radiusCvAmount,
    moveSource: isVisualCvModulationSourceValue(value.moveSource)
      ? value.moveSource
      : fallback.moveSource,
    moveRate:
      typeof value.moveRate === "number" && Number.isFinite(value.moveRate)
        ? clampSetting(value.moveRate, 0, 20)
        : fallback.moveRate,
    degreesPerPulse:
      typeof value.degreesPerPulse === "number" &&
      Number.isFinite(value.degreesPerPulse)
        ? Math.max(value.degreesPerPulse, 0)
        : fallback.degreesPerPulse,
    depthPerPulse:
      typeof value.depthPerPulse === "number" &&
      Number.isFinite(value.depthPerPulse)
        ? Math.max(value.depthPerPulse, 0)
        : fallback.depthPerPulse,
    pathDurationMs,
    pathCount,
    spawnSource: isVisualCvModulationSourceValue(value.spawnSource)
      ? value.spawnSource
      : fallback.spawnSource,
    spawnRateHz:
      typeof value.spawnRateHz === "number" && Number.isFinite(value.spawnRateHz)
        ? clampSetting(value.spawnRateHz, 0, 20)
        : fallback.spawnRateHz,
    maxActiveShapes,
    edgePadding:
      typeof value.edgePadding === "number" && Number.isFinite(value.edgePadding)
        ? clampSetting(value.edgePadding, 0, 0.5)
        : fallback.edgePadding,
    direction:
      value.direction === "clockwise" || value.direction === "counterclockwise"
        ? value.direction
        : fallback.direction,
    startPhaseDegrees:
      typeof value.startPhaseDegrees === "number" &&
      Number.isFinite(value.startPhaseDegrees)
        ? value.startPhaseDegrees
        : fallback.startPhaseDegrees,
  }
}

export function createDefaultShapeMotionMappings(): Record<
  ShapeControlName,
  ShapeMotionMapping
> {
  return shapeControlNames.reduce(
    (mappings, parameterName) => ({
      ...mappings,
      [parameterName]: { ...defaultShapeMotionMapping },
    }),
    {} as Record<ShapeControlName, ShapeMotionMapping>,
  )
}

export function normalizeAudioControlledShapeSettings(
  value: AudioControlledShapeSettings,
): AudioControlledShapeSettings {
  const defaults = createDefaultAudioControlledShapeSettings()
  const rawValue = value as Partial<AudioControlledShapeSettings> & {
    position?: unknown
    positionMode?: unknown
    rotation?: unknown
    spiralMotion?: unknown
  }
  const motionMappings = shapeControlNames.reduce((mappings, controlName) => {
    mappings[controlName] = {
      ...defaults.motionMappings[controlName],
      ...rawValue.motionMappings?.[controlName],
    }

    return mappings
  }, {} as AudioControlledShapeSettings["motionMappings"])

  return {
    ...defaults,
    ...value,
    parameters: {
      ...defaults.parameters,
      ...rawValue.parameters,
    },
    position: normalizeShapeVector3(rawValue.position, defaults.position),
    positionMode:
      rawValue.positionMode === "spiral" ? "spiral" : defaults.positionMode,
    rotation: normalizeShapeVector3(rawValue.rotation, defaults.rotation),
    spiralMotion: normalizeShapeSpiralMotionSettings(
      rawValue.spiralMotion,
      defaults.spiralMotion,
    ),
    motionMappings,
  }
}

export function createDefaultAudioControlledShapeSettings(): AudioControlledShapeSettings {
  return {
    enabled: false,
    mode: "2d",
    family: "prism",
    color: "#00d1ff",
    parameters: { ...defaultShapeParameters },
    positionMode: "manual",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    spiralMotion: { ...defaultShapeSpiralMotionSettings },
    motionMappings: createDefaultShapeMotionMappings(),
  }
}
