import * as THREE from "three"

export type StageRenderCanvas = HTMLCanvasElement | OffscreenCanvas

export type CreateRendererOptions = {
  canvas: StageRenderCanvas
  pixelRatio: number
  width: number
  height: number
}

export function createRenderer({
  canvas,
  height,
  pixelRatio,
  width,
}: CreateRendererOptions) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas as HTMLCanvasElement,
    antialias: true,
    alpha: false,
  })

  renderer.setClearColor(0x000000, 1)
  renderer.setPixelRatio(Math.min(pixelRatio, 2))
  renderer.setSize(width, height, false)

  return renderer
}
