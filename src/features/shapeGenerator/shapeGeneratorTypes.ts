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
export type ShapeControlName = ShapeParameterName | "rotation"

export type ShapeMotionSource = "level" | "rise-fall"

export type ShapeMotionMapping = {
  enabled: boolean
  source: ShapeMotionSource
  amount: number
  invert: boolean
}

export type AudioControlledShapeSettings = {
  enabled: boolean
  mode: ShapeMode
  family: ShapeFamily
  parameters: ShapeParameters
  rotation: number
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
  "rotation",
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
    parameters: { ...defaultShapeParameters },
    rotation: 0,
    motionMappings: createDefaultShapeMotionMappings(),
  }
}
