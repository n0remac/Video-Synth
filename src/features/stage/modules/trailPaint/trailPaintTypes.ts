export type TrailPoint = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
}

export type Trail = {
  userId: string
  color: string
  lineCount: number
  trailLength: number
  points: TrailPoint[]
}

export type TrailPaintInput = {
  userId: string
  x: number
  y: number
  vx: number
  vy: number
  color: string
  down: boolean
  lineCount: number
  trailLength: number
}

export type TrailPaintState = {
  trails: Record<string, Trail>
}
