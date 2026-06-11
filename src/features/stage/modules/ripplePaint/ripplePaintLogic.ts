import { clamp } from "@/shared/math/clamp"
import type { Ripple, RippleInput, RipplePaintState } from "./ripplePaintTypes"

const baseMaxRadius = 0.12
const speedRadiusScale = 0.35
const baseLifetime = 1.4

export function createRipple(input: RippleInput): Ripple {
  const intensity = clamp(input.intensity ?? 0.65, 0.1, 1)
  const speed = clamp(input.speed, 0, 4)

  return {
    id: input.id,
    userId: input.userId,
    x: input.x,
    y: input.y,
    radius: 0.001,
    maxRadius: (baseMaxRadius + speed * speedRadiusScale) * intensity,
    opacity: 1,
    age: 0,
    lifetime: baseLifetime + intensity * 0.8,
    color: input.color,
  }
}

export function updateRipple(ripple: Ripple, dt: number): Ripple {
  const age = ripple.age + dt
  const progress = clamp(age / ripple.lifetime, 0, 1)
  const easeOut = 1 - Math.pow(1 - progress, 2)

  return {
    ...ripple,
    age,
    radius: ripple.maxRadius * easeOut,
    opacity: 1 - progress,
  }
}

export function updateRipplePaintState(
  state: RipplePaintState,
  dt: number,
): RipplePaintState {
  return {
    ripples: state.ripples
      .map((ripple) => updateRipple(ripple, dt))
      .filter((ripple) => ripple.age < ripple.lifetime),
  }
}

export function addRipple(
  state: RipplePaintState,
  input: RippleInput,
  maxRipples: number,
): RipplePaintState {
  const ripples = [...state.ripples, createRipple(input)]

  return {
    ripples: ripples.slice(Math.max(0, ripples.length - maxRipples)),
  }
}
