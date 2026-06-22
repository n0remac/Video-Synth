import * as THREE from "three"

const stageCameraZ = 5
const stageCameraFar = 100000

function getFovForVisibleHeight(worldHeight: number, cameraZ: number) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(worldHeight / (2 * cameraZ)))
}

export function createCamera(worldHeight: number) {
  const camera = new THREE.PerspectiveCamera(
    getFovForVisibleHeight(worldHeight, stageCameraZ),
    1,
    0.1,
    stageCameraFar,
  )

  camera.position.z = stageCameraZ
  camera.updateProjectionMatrix()

  return camera
}

export function resizeCameraToViewport(
  camera: THREE.PerspectiveCamera,
  worldHeight: number,
) {
  const aspect = window.innerWidth / window.innerHeight
  const worldWidth = worldHeight * aspect

  camera.aspect = aspect
  camera.fov = getFovForVisibleHeight(worldHeight, stageCameraZ)
  camera.updateProjectionMatrix()

  return {
    worldWidth,
    worldHeight,
  }
}
