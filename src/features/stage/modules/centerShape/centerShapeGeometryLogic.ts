import type {
  ShapeFamily,
  ShapeMode,
  ShapeParameters,
} from "../../../shapeGenerator/shapeGeneratorTypes"

export type CenterShapeGeometryShape = {
  family: ShapeFamily
  mode: ShapeMode
  parameters: ShapeParameters
}

export function isShapeSizeGeometryBound(shape: CenterShapeGeometryShape) {
  return (
    shape.mode === "3d" &&
    shape.family === "prism" &&
    shape.parameters.bevel > 0
  )
}

export function getSpiralGeometryParameters(
  shape: CenterShapeGeometryShape,
): ShapeParameters {
  if (isShapeSizeGeometryBound(shape)) {
    return shape.parameters
  }

  return {
    ...shape.parameters,
    size: 1,
  }
}

export function getSpiralGeometrySignature(shape: CenterShapeGeometryShape) {
  return JSON.stringify({
    family: shape.family,
    mode: shape.mode,
    parameters: getSpiralGeometryParameters(shape),
  })
}

export function getSpiralInstanceScale(shape: CenterShapeGeometryShape) {
  if (isShapeSizeGeometryBound(shape)) {
    return { x: 1, y: 1, z: 1 }
  }

  const size = shape.parameters.size

  if (
    shape.mode === "2d" ||
    shape.family === "prism" ||
    shape.family === "pyramid"
  ) {
    return { x: size, y: size, z: 1 }
  }

  return { x: size, y: size, z: size }
}
