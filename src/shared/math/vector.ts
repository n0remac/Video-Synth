export type Vector2 = {
  x: number
  y: number
}

export function magnitude(vector: Vector2) {
  return Math.hypot(vector.x, vector.y)
}

export function normalizeVector(vector: Vector2): Vector2 {
  const length = magnitude(vector)

  if (length === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}
