import * as THREE from "three"
import type { Ripple } from "./ripplePaintTypes"

export function createRippleMesh(ripple: Ripple): THREE.Mesh {
  const geometry = new THREE.RingGeometry(0.72, 1, 72)
  const material = new THREE.MeshBasicMaterial({
    color: ripple.color,
    transparent: true,
    opacity: ripple.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  applyRippleToMesh(mesh, ripple)

  return mesh
}

export function applyRippleToMesh(mesh: THREE.Mesh, ripple: Ripple) {
  mesh.position.set(ripple.x, ripple.y, 0)
  mesh.scale.setScalar(Math.max(ripple.radius, 0.001))

  const material = mesh.material as THREE.MeshBasicMaterial
  material.opacity = ripple.opacity
  material.color.set(ripple.color)
}

export function disposeRippleMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose()

  if (Array.isArray(mesh.material)) {
    for (const material of mesh.material) {
      material.dispose()
    }
    return
  }

  mesh.material.dispose()
}
