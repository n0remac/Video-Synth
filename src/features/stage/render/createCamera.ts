import * as THREE from "three"

export function createCamera(worldWidth: number, worldHeight: number) {
  const camera = new THREE.OrthographicCamera(
    -worldWidth / 2,
    worldWidth / 2,
    worldHeight / 2,
    -worldHeight / 2,
    0.1,
    10,
  )

  camera.position.z = 5
  camera.updateProjectionMatrix()

  return camera
}

export function resizeCameraToViewport(
  camera: THREE.OrthographicCamera,
  worldHeight: number,
) {
  const aspect = window.innerWidth / window.innerHeight
  const worldWidth = worldHeight * aspect

  camera.left = -worldWidth / 2
  camera.right = worldWidth / 2
  camera.top = worldHeight / 2
  camera.bottom = -worldHeight / 2
  camera.updateProjectionMatrix()

  return {
    worldWidth,
    worldHeight,
  }
}
