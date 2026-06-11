export type StageConfig = {
  backgroundColor: string
  targetFps: number
  maxRipples: number
  worldWidth: number
  worldHeight: number
}

export const stageConfig: StageConfig = {
  backgroundColor: "#000000",
  targetFps: 60,
  maxRipples: 500,
  worldWidth: 2,
  worldHeight: 1.125,
}
