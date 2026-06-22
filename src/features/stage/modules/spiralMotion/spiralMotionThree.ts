import * as THREE from "three"
import type { SpiralMotionSample } from "./spiralMotionTypes"

export type SpiralPathLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>

export function createSpiralPathLine(): SpiralPathLine {
  const geometry = new THREE.BufferGeometry()
  const material = new THREE.LineBasicMaterial({
    color: 0x8ee6ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  })
  const line = new THREE.Line(geometry, material)

  line.frustumCulled = false
  line.renderOrder = 4
  line.visible = false

  return line
}

export function applySpiralPathToLine(
  line: SpiralPathLine,
  samples: SpiralMotionSample[],
) {
  const positions = new Float32Array(samples.length * 3)

  samples.forEach((sample, index) => {
    const offset = index * 3

    positions[offset] = sample.x
    positions[offset + 1] = sample.y
    positions[offset + 2] = sample.z
  })

  line.geometry.dispose()
  line.geometry = new THREE.BufferGeometry()
  line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  line.geometry.computeBoundingSphere()
}

export function disposeSpiralPathLine(line: SpiralPathLine) {
  line.geometry.dispose()
  line.material.dispose()
}
