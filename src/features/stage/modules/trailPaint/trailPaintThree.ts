import * as THREE from "three"
import type { Trail } from "./trailPaintTypes"

const minCurveSamples = 36
const maxCurveSamples = 180
const sampleDensity = 18
const strandWobble = 0.0012

export type TrailLine = THREE.Line<
  THREE.BufferGeometry,
  THREE.LineBasicMaterial
>

export function createTrailLine(color: string): TrailLine {
  const geometry = new THREE.BufferGeometry()
  const material = new THREE.LineBasicMaterial({
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  return new THREE.Line(geometry, material)
}

function getBundleOffset(lineIndex: number, lineCount: number) {
  if (lineCount <= 1) {
    return 0
  }

  const normalized = lineIndex / (lineCount - 1) * 2 - 1
  const bundled = Math.sign(normalized) * Math.pow(Math.abs(normalized), 1.45)
  const bundleWidth = Math.min(0.006, 0.002 + lineCount * 0.00045)

  return bundled * bundleWidth * 0.5
}

function getCurvePoint(
  curve: THREE.CatmullRomCurve3,
  t: number,
  target = new THREE.Vector3(),
) {
  return curve.getPoint(THREE.MathUtils.clamp(t, 0, 1), target)
}

function getCurveNormal(curve: THREE.CatmullRomCurve3, t: number) {
  const before = getCurvePoint(curve, t - 0.01)
  const after = getCurvePoint(curve, t + 0.01)
  const dx = after.x - before.x
  const dy = after.y - before.y
  const length = Math.hypot(dx, dy)

  if (length <= 0.0001) {
    return { x: 0, y: 1 }
  }

  return {
    x: -dy / length,
    y: dx / length,
  }
}

function createTrailCurve(trail: Trail) {
  const points = trail.points.map((point) => new THREE.Vector3(point.x, point.y, 0))

  if (points.length < 2) {
    return null
  }

  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.45)
}

function getPointAgeAt(trail: Trail, t: number) {
  if (trail.points.length === 0) {
    return trail.trailLength
  }

  if (trail.points.length === 1) {
    return trail.points[0].age
  }

  const scaledIndex = THREE.MathUtils.clamp(t, 0, 1) * (trail.points.length - 1)
  const beforeIndex = Math.floor(scaledIndex)
  const afterIndex = Math.min(beforeIndex + 1, trail.points.length - 1)
  const amount = scaledIndex - beforeIndex

  return THREE.MathUtils.lerp(
    trail.points[beforeIndex].age,
    trail.points[afterIndex].age,
    amount,
  )
}

function getTailFade(trail: Trail, t: number) {
  const age = getPointAgeAt(trail, t)
  const ageFade = 1 - THREE.MathUtils.clamp(age / trail.trailLength, 0, 1)
  const tailTaper = THREE.MathUtils.smoothstep(t, 0, 0.16)

  return Math.pow(ageFade, 1.35) * tailTaper
}

export function applyTrailToLines(
  lines: TrailLine[],
  trail: Trail,
  elapsedTime: number,
) {
  const curve = createTrailCurve(trail)
  const sampleCount = THREE.MathUtils.clamp(
    trail.points.length * sampleDensity,
    minCurveSamples,
    maxCurveSamples,
  )

  lines.forEach((line, lineIndex) => {
    if (!curve) {
      line.visible = false
      return
    }

    const offset = getBundleOffset(lineIndex, trail.lineCount)
    const strandPhase = lineIndex * 1.73
    const outerness = trail.lineCount <= 1
      ? 0
      : Math.abs(lineIndex / (trail.lineCount - 1) * 2 - 1)
    const strandLag = outerness * 0.004 + lineIndex * 0.0006
    const points: THREE.Vector3[] = []
    const colors: number[] = []
    const color = new THREE.Color(trail.color)

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const t = sampleIndex / Math.max(sampleCount - 1, 1)
      const laggedT = THREE.MathUtils.clamp(t - strandLag * (1 - t), 0, 1)
      const point = getCurvePoint(curve, laggedT)
      const normal = getCurveNormal(curve, laggedT)
      const wobble =
        Math.sin(elapsedTime * 5.2 + t * 8 + strandPhase) *
        strandWobble *
        (0.35 + outerness * 0.65)
      const strandOffset = offset + wobble

      points.push(
        new THREE.Vector3(
          point.x + normal.x * strandOffset,
          point.y + normal.y * strandOffset,
          0,
        ),
      )

      const fade = getTailFade(trail, laggedT)
      colors.push(color.r * fade, color.g * fade, color.b * fade)
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    line.geometry.dispose()
    line.geometry = geometry
    line.material.opacity = Math.min(0.82, 0.42 + 0.26 / Math.sqrt(trail.lineCount))
    line.visible = points.length > 1
  })
}

export function disposeTrailLine(line: TrailLine) {
  line.geometry.dispose()
  line.material.dispose()
}
