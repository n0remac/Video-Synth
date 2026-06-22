import * as THREE from "three"
import type {
  ShapeFamily,
  ShapeMode,
  ShapeParameters,
  ShapeVector3,
} from "./shapeGeneratorTypes"

export const polyhedronSideCounts = [4, 6, 8, 12, 20]

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

type ShapeColorMaterial = THREE.Material & {
  color?: THREE.Color
}

const shapeFillMaterialKey = "shapeFillMaterial"

function toRadians(degrees: number): number {
  return (degrees / 180) * Math.PI
}

function rotationToRadians(rotation: ShapeVector3) {
  return {
    x: toRadians(rotation.x),
    y: toRadians(rotation.y),
    z: toRadians(rotation.z),
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getNearestPolyhedronSideCount(value: number): number {
  return polyhedronSideCounts.reduce((nearest, option) => {
    const nearestDistance = Math.abs(nearest - value)
    const optionDistance = Math.abs(option - value)

    return optionDistance < nearestDistance ? option : nearest
  }, polyhedronSideCounts[0])
}

function createAngleSteps(sides: number, angleBias: number): number[] {
  const influence = Math.abs(angleBias)

  if (influence === 0) {
    return Array.from({ length: sides }, () => (Math.PI * 2) / sides)
  }

  const direction = Math.sign(angleBias)
  const weights = Array.from({ length: sides }, (_, index) => {
    const phase = (index / sides) * Math.PI * 2
    const smoothWave = Math.sin(phase + Math.PI / 3)
    const staggeredWave = Math.cos(phase * 2 - Math.PI / 5)
    const blendedWave = smoothWave * 0.72 + staggeredWave * 0.28

    return Math.max(0.3, 1 + direction * influence * 0.72 * blendedWave)
  })
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)

  return weights.map((weight) => (weight / totalWeight) * Math.PI * 2)
}

function getRadiusScale(index: number, sides: number, sideVariation: number) {
  if (sideVariation === 0) {
    return 1
  }

  const phase = (index / sides) * Math.PI * 2
  const alternatingWave = index % 2 === 0 ? 1 : -1
  const flowingWave = Math.sin(phase * 3 + Math.PI / 6)
  const blendedWave = alternatingWave * 0.68 + flowingWave * 0.32

  return clamp(1 + sideVariation * 0.34 * blendedWave, 0.55, 1.45)
}

function createPolygonPoints({
  angleBias,
  radius,
  sideVariation,
  sides,
}: {
  angleBias: number
  radius: number
  sideVariation: number
  sides: number
}): THREE.Vector2[] {
  const angleSteps = createAngleSteps(sides, angleBias)
  let angle = Math.PI / 2

  return Array.from({ length: sides }, (_, index) => {
    if (index > 0) {
      angle += angleSteps[index - 1]
    }

    const pointRadius = radius * getRadiusScale(index, sides, sideVariation)

    return new THREE.Vector2(
      Math.cos(angle) * pointRadius,
      Math.sin(angle) * pointRadius,
    )
  })
}

function createPolygonShape(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape()

  shape.moveTo(points[0].x, points[0].y)
  points.slice(1).forEach((point) => shape.lineTo(point.x, point.y))
  shape.closePath()

  return shape
}

function disposeMaterial(material: THREE.Material) {
  material.dispose()
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const disposable = child as DisposableObject

    disposable.geometry?.dispose()

    if (Array.isArray(disposable.material)) {
      disposable.material.forEach(disposeMaterial)
      return
    }

    disposable.material?.dispose()
  })
}

export function clearGroup(group: THREE.Group) {
  group.children.slice().forEach((child) => {
    group.remove(child)
    disposeObject(child)
  })
}

function markShapeFillMaterial<TMaterial extends THREE.Material>(
  material: TMaterial,
) {
  material.userData[shapeFillMaterialKey] = true

  return material
}

function applyColorToMaterial(
  material: THREE.Material,
  color: THREE.ColorRepresentation,
) {
  const colorMaterial = material as ShapeColorMaterial

  if (material.userData[shapeFillMaterialKey] !== true || !colorMaterial.color) {
    return
  }

  colorMaterial.color.set(color)
}

export function applyShapeColor(
  object: THREE.Object3D,
  color: THREE.ColorRepresentation,
) {
  object.traverse((child) => {
    const disposable = child as DisposableObject

    if (Array.isArray(disposable.material)) {
      disposable.material.forEach((material) =>
        applyColorToMaterial(material, color),
      )
      return
    }

    if (disposable.material) {
      applyColorToMaterial(disposable.material, color)
    }
  })
}

function createSolidShape(
  geometry: THREE.BufferGeometry,
  {
    color = 0x3cff9e,
    edgeStyle = "edges",
  }: {
    color?: THREE.ColorRepresentation
    edgeStyle?: "edges" | "wire"
  } = {},
): THREE.Object3D {
  const group = new THREE.Group()
  const fillMaterial = markShapeFillMaterial(
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.18,
      roughness: 0.48,
    }),
  )
  const mesh = new THREE.Mesh(geometry, fillMaterial)
  const edgeGeometry =
    edgeStyle === "wire"
      ? new THREE.WireframeGeometry(geometry)
      : new THREE.EdgesGeometry(geometry, 20)
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: edgeStyle === "wire" ? 0.38 : 0.62,
    }),
  )

  group.add(mesh, edges)

  return group
}

function create2DShape({
  parameters,
  color = 0x00d1ff,
}: {
  parameters: ShapeParameters
  color?: THREE.ColorRepresentation
}): THREE.Object3D {
  const {
    angleBias,
    sideVariation,
    sides,
    size,
  } = parameters
  const group = new THREE.Group()
  const polygonPoints = createPolygonPoints({
    angleBias,
    radius: size,
    sideVariation,
    sides,
  })
  const shape = createPolygonShape(polygonPoints)
  const fillGeometry = new THREE.ShapeGeometry(shape)
  const fillMaterial = markShapeFillMaterial(
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
    }),
  )
  const fill = new THREE.Mesh(fillGeometry, fillMaterial)
  const outlinePoints = polygonPoints
    .concat(polygonPoints[0])
    .map((point) => new THREE.Vector3(point.x, point.y, 0.04))
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints)
  const outline = new THREE.Line(
    outlineGeometry,
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  )

  group.add(fill, outline)

  return group
}

function applyTaperAndTwist(
  geometry: THREE.BufferGeometry,
  depth: number,
  taper: number,
  twist: number,
) {
  const position = geometry.getAttribute("position")
  const twistRadians = toRadians(twist)

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const progress = clamp(z / Math.max(depth, 0.001), 0, 1)
    const scale = 1 + (taper - 1) * progress
    const angle = twistRadians * progress
    const scaledX = x * scale
    const scaledY = y * scale
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    position.setXY(
      index,
      scaledX * cos - scaledY * sin,
      scaledX * sin + scaledY * cos,
    )
  }

  position.needsUpdate = true
}

function applyCenteredDepthTaperAndTwist(
  geometry: THREE.BufferGeometry,
  depth: number,
  taper: number,
  twist: number,
) {
  const position = geometry.getAttribute("position")
  const zScale = depth / 1.1

  for (let index = 0; index < position.count; index += 1) {
    position.setZ(index, position.getZ(index) * zScale)
  }

  geometry.computeBoundingBox()

  const bounds = geometry.boundingBox

  if (!bounds) {
    return
  }

  const span = Math.max(bounds.max.z - bounds.min.z, 0.001)
  const twistRadians = toRadians(twist)

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const progress = clamp((z - bounds.min.z) / span, 0, 1)
    const scale = 1 + (taper - 1) * progress
    const angle = twistRadians * progress
    const scaledX = x * scale
    const scaledY = y * scale
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    position.setXY(
      index,
      scaledX * cos - scaledY * sin,
      scaledX * sin + scaledY * cos,
    )
  }

  position.needsUpdate = true
}

function applySphericalVariation(
  geometry: THREE.BufferGeometry,
  sideVariation: number,
) {
  if (sideVariation === 0) {
    return
  }

  const position = geometry.getAttribute("position")

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const radius = Math.hypot(x, y, z)

    if (radius === 0) {
      continue
    }

    const azimuth = Math.atan2(y, x)
    const elevation = Math.acos(clamp(z / radius, -1, 1))
    const wave =
      Math.sin(azimuth * 3 + elevation * 2) * 0.62 +
      Math.cos(azimuth * 5 - elevation) * 0.38
    const scale = 1 + sideVariation * 0.18 * wave

    position.setXYZ(index, x * scale, y * scale, z * scale)
  }

  position.needsUpdate = true
}

function createPrismShape({
  parameters,
  color,
}: {
  parameters: ShapeParameters
  color?: THREE.ColorRepresentation
}): THREE.Object3D {
  const {
    angleBias,
    bevel,
    depth,
    sideVariation,
    sides,
    size,
    taper,
    twist,
  } = parameters
  const effectiveDepth = Math.max(depth, 0.05)
  const bevelAmount = Math.min(size * bevel, effectiveDepth * 0.35)
  const polygonPoints = createPolygonPoints({
    angleBias,
    radius: size,
    sideVariation,
    sides,
  })
  const shape = createPolygonShape(polygonPoints)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: bevelAmount > 0,
    bevelSegments: bevelAmount > 0 ? 2 : 0,
    bevelSize: bevelAmount,
    bevelThickness: bevelAmount,
    depth: effectiveDepth,
  })

  applyTaperAndTwist(geometry, effectiveDepth, taper, twist)
  geometry.center()
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color })
}

function createPyramidShape({
  parameters,
  color = 0xff8f3c,
}: {
  parameters: ShapeParameters
  color?: THREE.ColorRepresentation
}): THREE.Object3D {
  const {
    angleBias,
    depth,
    sideVariation,
    sides,
    size,
  } = parameters
  const effectiveDepth = Math.max(depth, 0.05)
  const basePoints = createPolygonPoints({
    angleBias,
    radius: size,
    sideVariation,
    sides,
  })
  const apexIndex = basePoints.length
  const centerIndex = apexIndex + 1
  const vertices = [
    ...basePoints.flatMap((point) => [point.x, point.y, -effectiveDepth / 2]),
    0,
    0,
    effectiveDepth / 2,
    0,
    0,
    -effectiveDepth / 2,
  ]
  const indices: number[] = []

  basePoints.forEach((_, index) => {
    const nextIndex = (index + 1) % basePoints.length

    indices.push(index, nextIndex, apexIndex)
    indices.push(centerIndex, nextIndex, index)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color })
}

function createSphereShape({
  parameters,
  color = 0x8ee6ff,
}: {
  parameters: ShapeParameters
  color?: THREE.ColorRepresentation
}): THREE.Object3D {
  const {
    depth,
    sideVariation,
    sides,
    size,
    taper,
    twist,
  } = parameters
  const widthSegments = Math.max(8, Math.min(64, sides * 2))
  const heightSegments = Math.max(6, Math.min(32, sides))
  const geometry = new THREE.SphereGeometry(size, widthSegments, heightSegments)

  applySphericalVariation(geometry, sideVariation)
  applyCenteredDepthTaperAndTwist(geometry, depth, taper, twist)
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color, edgeStyle: "wire" })
}

function createPolyhedronGeometry(sides: number, size: number) {
  switch (getNearestPolyhedronSideCount(sides)) {
    case 4:
      return new THREE.TetrahedronGeometry(size * 1.28)
    case 6:
      return new THREE.BoxGeometry(size * 1.55, size * 1.55, size * 1.55)
    case 8:
      return new THREE.OctahedronGeometry(size * 1.22)
    case 12:
      return new THREE.DodecahedronGeometry(size * 1.12)
    case 20:
      return new THREE.IcosahedronGeometry(size * 1.14)
    default:
      return new THREE.OctahedronGeometry(size * 1.22)
  }
}

function createPolyhedronShape({
  parameters,
  color = 0x3cff9e,
}: {
  parameters: ShapeParameters
  color?: THREE.ColorRepresentation
}): THREE.Object3D {
  const {
    depth,
    sides,
    size,
    taper,
    twist,
  } = parameters
  const geometry = createPolyhedronGeometry(sides, size)

  applyCenteredDepthTaperAndTwist(geometry, depth, taper, twist)
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color })
}

function create3DShape(
  family: ShapeFamily,
  parameters: ShapeParameters,
  color?: THREE.ColorRepresentation,
): THREE.Object3D {
  switch (family) {
    case "prism":
      return createPrismShape({ parameters, color })
    case "pyramid":
      return createPyramidShape({ parameters, color })
    case "sphere":
      return createSphereShape({ parameters, color })
    case "polyhedron":
      return createPolyhedronShape({ parameters, color })
    default:
      return createPrismShape({ parameters, color })
  }
}

export function buildShape({
  color,
  family,
  parameters,
  mode,
  rotation,
}: {
  color?: THREE.ColorRepresentation
  family: ShapeFamily
  parameters: ShapeParameters
  mode: ShapeMode
  rotation: number | ShapeVector3
}): THREE.Object3D {
  const shape =
    mode === "2d"
      ? create2DShape({ parameters, color })
      : create3DShape(family, parameters, color)

  if (typeof rotation !== "number") {
    const radians = rotationToRadians(rotation)

    shape.rotation.set(radians.x, radians.y, radians.z)
    return shape
  }

  const radians = toRadians(rotation)

  if (mode === "2d") {
    shape.rotation.z = radians
    return shape
  }

  shape.rotation.set(-0.52, radians, 0.18)

  return shape
}
