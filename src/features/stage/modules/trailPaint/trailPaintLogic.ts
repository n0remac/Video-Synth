import type {
  Trail,
  TrailPaintInput,
  TrailPaintState,
  TrailPoint,
} from "./trailPaintTypes"

export const minTrailLineCount = 1
export const maxTrailLineCount = 9
export const minTrailLength = 0.25
export const maxTrailLength = 3

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function normalizeTrailLineCount(value: number): number {
  return Math.round(clamp(value, minTrailLineCount, maxTrailLineCount))
}

export function normalizeTrailLength(value: number): number {
  return clamp(value, minTrailLength, maxTrailLength)
}

function trimTrailPoints(points: TrailPoint[], trailLength: number) {
  return points.filter((point) => point.age <= trailLength)
}

export function addTrailPoint(
  state: TrailPaintState,
  input: TrailPaintInput,
): TrailPaintState {
  const lineCount = normalizeTrailLineCount(input.lineCount)
  const trailLength = normalizeTrailLength(input.trailLength)
  const previous = state.trails[input.userId]
  const nextPoint: TrailPoint = {
    x: input.x,
    y: input.y,
    vx: input.vx,
    vy: input.vy,
    age: 0,
  }
  const previousPoints = previous
    ? trimTrailPoints(previous.points, trailLength)
    : []
  const points = input.down ? [...previousPoints, nextPoint] : previousPoints
  const nextTrail: Trail = {
    userId: input.userId,
    color: input.color,
    lineCount,
    trailLength,
    points,
  }

  return {
    trails: {
      ...state.trails,
      [input.userId]: nextTrail,
    },
  }
}

export function updateTrailPaintState(
  state: TrailPaintState,
  dt: number,
): TrailPaintState {
  const trails: Record<string, Trail> = {}

  for (const trail of Object.values(state.trails)) {
    const points = trimTrailPoints(
      trail.points.map((point) => ({
        ...point,
        age: point.age + dt,
      })),
      trail.trailLength,
    )

    if (points.length > 0) {
      trails[trail.userId] = {
        ...trail,
        points,
      }
    }
  }

  return { trails }
}
