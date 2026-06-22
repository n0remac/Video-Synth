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
  degreesPerPulse: number
  depthPerPulse: number
  resetMs: number
  direction: ShapeSpiralMotionDirection
  startPhaseDegrees: number
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
  startRadius: 0.65,
  radiusSource: "smooth",
  radiusCvAmount: 0.25,
  degreesPerPulse: 180,
  depthPerPulse: 0.5,
  resetMs: 4000,
  direction: "clockwise",
  startPhaseDegrees: 0,
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
