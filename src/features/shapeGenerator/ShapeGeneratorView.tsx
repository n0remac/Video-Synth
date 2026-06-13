"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { ControlSlider } from "@/features/controller/shared/ControlSlider"

type ShapeMode = "2d" | "3d"

type ShapeFamily =
  | "prism"
  | "pyramid"
  | "sphere"
  | "polyhedron"

type ShapeParameters = {
  angleBias: number
  bevel: number
  depth: number
  sideVariation: number
  sides: number
  size: number
  taper: number
  twist: number
}

type SceneHandle = {
  camera: THREE.PerspectiveCamera
  group: THREE.Group
  renderer: THREE.WebGLRenderer
  render(): void
}

const shapeFamilyOptions: Array<{ label: string; value: ShapeFamily }> = [
  { label: "Prism", value: "prism" },
  { label: "Pyramid", value: "pyramid" },
  { label: "Sphere", value: "sphere" },
  { label: "Polyhedron", value: "polyhedron" },
]

const polyhedronSideCounts = [4, 6, 8, 12, 20]

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

function toRadians(degrees: number): number {
  return (degrees / 180) * Math.PI
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getNearestPolyhedronSideCount(value: number): number {
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

function disposeObject(object: THREE.Object3D) {
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

function clearGroup(group: THREE.Group) {
  group.children.slice().forEach((child) => {
    group.remove(child)
    disposeObject(child)
  })
}

function createSolidShape(
  geometry: THREE.BufferGeometry,
  {
    color = 0x3cff9e,
    edgeStyle = "edges",
  }: {
    color?: number
    edgeStyle?: "edges" | "wire"
  } = {},
): THREE.Object3D {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.18,
      roughness: 0.48,
    }),
  )
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
  angleBias,
  sideVariation,
  sides,
  size,
}: ShapeParameters): THREE.Object3D {
  const group = new THREE.Group()
  const radius = size
  const polygonPoints = createPolygonPoints({
    angleBias,
    radius,
    sideVariation,
    sides,
  })
  const shape = createPolygonShape(polygonPoints)
  const fillGeometry = new THREE.ShapeGeometry(shape)
  const fill = new THREE.Mesh(
    fillGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x00d1ff,
      side: THREE.DoubleSide,
    }),
  )

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
  angleBias,
  bevel,
  depth,
  sideVariation,
  sides,
  size,
  taper,
  twist,
}: ShapeParameters): THREE.Object3D {
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

  return createSolidShape(geometry)
}

function createPyramidShape({
  angleBias,
  depth,
  sideVariation,
  sides,
  size,
}: ShapeParameters): THREE.Object3D {
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

  return createSolidShape(geometry, { color: 0xff8f3c })
}

function createSphereShape({
  depth,
  sideVariation,
  sides,
  size,
  taper,
  twist,
}: ShapeParameters): THREE.Object3D {
  const widthSegments = Math.max(8, Math.min(64, sides * 2))
  const heightSegments = Math.max(6, Math.min(32, sides))
  const geometry = new THREE.SphereGeometry(size, widthSegments, heightSegments)

  applySphericalVariation(geometry, sideVariation)
  applyCenteredDepthTaperAndTwist(geometry, depth, taper, twist)
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color: 0x8ee6ff, edgeStyle: "wire" })
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
  depth,
  sides,
  size,
  taper,
  twist,
}: ShapeParameters): THREE.Object3D {
  const geometry = createPolyhedronGeometry(sides, size)

  applyCenteredDepthTaperAndTwist(geometry, depth, taper, twist)
  geometry.computeVertexNormals()

  return createSolidShape(geometry, { color: 0x3cff9e })
}

function create3DShape(
  family: ShapeFamily,
  parameters: ShapeParameters,
): THREE.Object3D {
  switch (family) {
    case "prism":
      return createPrismShape(parameters)
    case "pyramid":
      return createPyramidShape(parameters)
    case "sphere":
      return createSphereShape(parameters)
    case "polyhedron":
      return createPolyhedronShape(parameters)
    default:
      return createPrismShape(parameters)
  }
}

function buildShape({
  family,
  parameters,
  mode,
  rotation,
}: {
  family: ShapeFamily
  parameters: ShapeParameters
  mode: ShapeMode
  rotation: number
}): THREE.Object3D {
  const shape =
    mode === "2d" ? create2DShape(parameters) : create3DShape(family, parameters)
  const radians = toRadians(rotation)

  if (mode === "2d") {
    shape.rotation.z = radians
    return shape
  }

  shape.rotation.set(-0.52, radians, 0.18)

  return shape
}

export function ShapeGeneratorView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<SceneHandle | null>(null)
  const [mode, setMode] = useState<ShapeMode>("2d")
  const [shapeFamily, setShapeFamily] = useState<ShapeFamily>("prism")
  const [sides, setSides] = useState(6)
  const [size, setSize] = useState(1.7)
  const [rotation, setRotation] = useState(0)
  const [angleBias, setAngleBias] = useState(0)
  const [sideVariation, setSideVariation] = useState(0)
  const [depth, setDepth] = useState(1.1)
  const [bevel, setBevel] = useState(0.04)
  const [twist, setTwist] = useState(0)
  const [taper, setTaper] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    const group = new THREE.Group()
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
    const rimLight = new THREE.DirectionalLight(0xff8f3c, 0.85)
    const fillLight = new THREE.HemisphereLight(0x8ee6ff, 0x050505, 1.2)

    renderer.setClearColor(0x050608, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene.background = new THREE.Color(0x050608)
    scene.add(group)
    camera.position.set(0, 0, 7)
    keyLight.position.set(2.5, 4, 5)
    rimLight.position.set(-4, 2, -3)
    scene.add(keyLight, rimLight, fillLight)

    const render = () => {
      renderer.render(scene, camera)
    }

    const handleResize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      render()
    }

    sceneRef.current = {
      camera,
      group,
      renderer,
      render,
    }

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      clearGroup(group)
      renderer.dispose()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current

    if (!scene) {
      return
    }

    clearGroup(scene.group)
    scene.group.add(
      buildShape({
        family: shapeFamily,
        mode,
        parameters: {
          angleBias,
          bevel,
          depth,
          sideVariation,
          sides,
          size,
          taper,
          twist,
        },
        rotation,
      }),
    )
    scene.camera.position.set(0, mode === "3d" ? 0.35 : 0, 7)
    scene.camera.lookAt(0, 0, 0)
    scene.render()
  }, [
    angleBias,
    bevel,
    depth,
    mode,
    rotation,
    shapeFamily,
    sideVariation,
    sides,
    size,
    taper,
    twist,
  ])

  const isPolygonal3D =
    mode === "3d" && (shapeFamily === "prism" || shapeFamily === "pyramid")
  const isSphere = mode === "3d" && shapeFamily === "sphere"
  const isPolyhedron = mode === "3d" && shapeFamily === "polyhedron"
  const showSides = mode === "2d" || isPolygonal3D || isSphere || isPolyhedron
  const showAngleBias = mode === "2d" || isPolygonal3D
  const showSideVariation = mode === "2d" || isPolygonal3D || isSphere
  const showBevel = mode === "3d" && shapeFamily === "prism"
  const showTwistAndTaper = mode === "3d" && shapeFamily !== "pyramid"
  const sideSliderValue = isPolyhedron
    ? getNearestPolyhedronSideCount(sides)
    : sides
  const sideSliderMin = isPolyhedron ? 4 : 3
  const sideSliderMax = isPolyhedron ? 20 : 24

  return (
    <main className="shape-generator-shell">
      <canvas ref={canvasRef} className="shape-generator-canvas" />

      <header className="shape-generator-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Shape Generator</h1>
        </div>
      </header>

      <section className="shape-control-panel" aria-label="Shape controls">
        <div className="mode-toggle" role="group" aria-label="Shape dimension">
          <button
            type="button"
            data-active={mode === "2d"}
            aria-pressed={mode === "2d"}
            onClick={() => setMode("2d")}
          >
            2D
          </button>
          <button
            type="button"
            data-active={mode === "3d"}
            aria-pressed={mode === "3d"}
            onClick={() => setMode("3d")}
          >
            3D
          </button>
        </div>

        {mode === "3d" ? (
          <label className="control-field">
            <span>Form</span>
            <select
              value={shapeFamily}
              onChange={(event) =>
                setShapeFamily(event.target.value as ShapeFamily)
              }
            >
              {shapeFamilyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showSides ? (
          <ControlSlider
            label={isSphere ? "Segments" : "Sides"}
            value={sideSliderValue}
            min={sideSliderMin}
            max={sideSliderMax}
            step={1}
            onValueChange={(value) =>
              setSides(isPolyhedron ? getNearestPolyhedronSideCount(value) : value)
            }
          />
        ) : null}
        <ControlSlider
          label="Size"
          value={size}
          min={0.7}
          max={2.6}
          step={0.1}
          onValueChange={setSize}
        />
        <ControlSlider
          label="Rotation"
          value={rotation}
          min={0}
          max={360}
          step={1}
          onValueChange={setRotation}
        />
        {showAngleBias ? (
          <ControlSlider
            label="Angle Bias"
            value={angleBias}
            min={-1}
            max={1}
            step={0.01}
            onValueChange={setAngleBias}
          />
        ) : null}
        {showSideVariation ? (
          <ControlSlider
            label="Side Variation"
            value={sideVariation}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setSideVariation}
          />
        ) : null}
        {mode === "3d" ? (
          <>
            <ControlSlider
              label="Depth"
              value={depth}
              min={0.2}
              max={3}
              step={0.1}
              onValueChange={setDepth}
            />
            {showBevel ? (
              <ControlSlider
                label="Bevel"
                value={bevel}
                min={0}
                max={0.18}
                step={0.01}
                onValueChange={setBevel}
              />
            ) : null}
            {showTwistAndTaper ? (
              <>
                <ControlSlider
                  label="Twist"
                  value={twist}
                  min={-180}
                  max={180}
                  step={1}
                  onValueChange={setTwist}
                />
                <ControlSlider
                  label="Taper"
                  value={taper}
                  min={0.25}
                  max={1.8}
                  step={0.01}
                  onValueChange={setTaper}
                />
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}
