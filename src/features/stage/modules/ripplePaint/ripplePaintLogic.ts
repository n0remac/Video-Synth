import type { AudioRouteSignal } from "@/features/network/protocolTypes"
import type { Ripple, RippleInput, RipplePaintState } from "./ripplePaintTypes"

const baseMaxRadius = 0.12
const speedRadiusScale = 0.35
const baseLifetime = 1.4
const audioRiseThreshold = 0.05
const audioFallThreshold = 0.07
const audioReleaseTimeout = 1.35
const audioMaxLifetime = 3.2

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getAudioLevelRadius(level: number, intensity: number) {
  return (0.16 + clamp(level, 0, 1) * 1.15) * intensity
}

function moveToward(current: number, target: number, maxStep: number) {
  if (current < target) {
    return Math.min(current + maxStep, target)
  }

  return Math.max(current - maxStep, target)
}

export function createRipple(input: RippleInput): Ripple {
  const intensity = clamp(input.intensity ?? 0.65, 0.1, 1)
  const speed = clamp(input.speed, 0, 4)
  const fixedMaxRadius = (baseMaxRadius + speed * speedRadiusScale) * intensity
  const audioMotion = input.audioMotion
  const maxRadius =
    audioMotion?.levelControlsSize === true
      ? getAudioLevelRadius(audioMotion.level, intensity)
      : fixedMaxRadius

  return {
    id: input.id,
    userId: input.userId,
    x: input.x,
    y: input.y,
    radius: 0.001,
    maxRadius,
    opacity: 1,
    age: 0,
    lifetime: baseLifetime + intensity * 0.8,
    color: input.color,
    audioMotion: audioMotion
      ? {
          audioInstanceId: audioMotion.audioInstanceId,
          growOnRise: audioMotion.growOnRise,
          fadeOnFall: audioMotion.fadeOnFall,
          shrinkOnFall: audioMotion.shrinkOnFall,
          levelControlsSize: audioMotion.levelControlsSize,
          phase: "rising",
          hasRisen: audioMotion.riseAmount >= audioRiseThreshold,
          signalAge: 0,
          riseAmount: clamp(audioMotion.riseAmount, 0, 1),
          fallAmount: clamp(audioMotion.fallAmount, 0, 1),
          level: clamp(audioMotion.level, 0, 1),
          peakRadius: 0.001,
        }
      : undefined,
  }
}

export function updateRippleFromAudioRoute(
  ripple: Ripple,
  routeSignal: AudioRouteSignal,
): Ripple {
  const audioMotion = ripple.audioMotion

  if (!audioMotion || audioMotion.audioInstanceId !== routeSignal.audioInstanceId) {
    return ripple
  }

  const riseAmount = clamp(routeSignal.riseAmount, 0, 1)
  const fallAmount = clamp(routeSignal.fallAmount, 0, 1)
  const hasRisen = audioMotion.hasRisen || riseAmount >= audioRiseThreshold
  const shouldRelease =
    audioMotion.phase !== "falling" &&
    hasRisen &&
    (audioMotion.fadeOnFall || audioMotion.shrinkOnFall) &&
    fallAmount >= audioFallThreshold
  const level = clamp(routeSignal.level, 0, 1)
  const maxRadius =
    audioMotion.levelControlsSize && audioMotion.phase !== "falling"
      ? Math.max(ripple.maxRadius, getAudioLevelRadius(level, 0.65))
      : ripple.maxRadius

  return {
    ...ripple,
    maxRadius,
    audioMotion: {
      ...audioMotion,
      phase: shouldRelease ? "falling" : audioMotion.phase,
      hasRisen,
      signalAge: 0,
      riseAmount,
      fallAmount,
      level,
      peakRadius: Math.max(audioMotion.peakRadius, ripple.radius),
    },
  }
}

function updateAudioMotionRipple(ripple: Ripple, dt: number): Ripple {
  const audioMotion = ripple.audioMotion

  if (!audioMotion) {
    return updateFixedRipple(ripple, dt)
  }

  const age = ripple.age + dt
  const signalAge = audioMotion.signalAge + dt
  const hasReleaseControls = audioMotion.fadeOnFall || audioMotion.shrinkOnFall
  const timedOutRelease =
    hasReleaseControls &&
    audioMotion.phase !== "falling" &&
    (age >= audioReleaseTimeout || signalAge >= 0.45)
  const phase = timedOutRelease ? "falling" : audioMotion.phase
  let radius = ripple.radius
  let opacity = ripple.opacity

  if (phase === "falling") {
    const fallDrive = Math.max(audioMotion.fallAmount, timedOutRelease ? 0.18 : 0.08)

    if (audioMotion.fadeOnFall) {
      opacity = clamp(opacity - (0.34 + fallDrive * 2.8) * dt, 0, 1)
    } else {
      opacity = clamp(1 - age / audioMaxLifetime, 0, 1)
    }

    if (audioMotion.shrinkOnFall) {
      radius = Math.max(0.001, radius - (0.12 + fallDrive * 1.65) * dt)
    }
  } else if (audioMotion.growOnRise) {
    const riseDrive = Math.max(audioMotion.riseAmount, 0.035)
    radius = moveToward(radius, ripple.maxRadius, (0.08 + riseDrive * 1.8) * dt)
    opacity = hasReleaseControls ? opacity : clamp(1 - age / audioMaxLifetime, 0, 1)
  } else {
    const progress = clamp(age / ripple.lifetime, 0, 1)
    const easeOut = 1 - Math.pow(1 - progress, 2)

    radius = ripple.maxRadius * easeOut
    opacity = hasReleaseControls ? opacity : 1 - progress
  }

  return {
    ...ripple,
    age,
    radius,
    opacity,
    audioMotion: {
      ...audioMotion,
      phase,
      signalAge,
      peakRadius: Math.max(audioMotion.peakRadius, radius),
    },
  }
}

function updateFixedRipple(ripple: Ripple, dt: number): Ripple {
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

export function updateRipple(ripple: Ripple, dt: number): Ripple {
  return ripple.audioMotion
    ? updateAudioMotionRipple(ripple, dt)
    : updateFixedRipple(ripple, dt)
}

export function updateRipplePaintState(
  state: RipplePaintState,
  dt: number,
): RipplePaintState {
  return {
    ripples: state.ripples
      .map((ripple) => updateRipple(ripple, dt))
      .filter((ripple) => {
        if (!ripple.audioMotion) {
          return ripple.age < ripple.lifetime
        }

        return (
          ripple.age < audioMaxLifetime &&
          ripple.opacity > 0.02 &&
          (!ripple.audioMotion.shrinkOnFall || ripple.radius > 0.006)
        )
      }),
  }
}

export function updateRipplePaintStateFromAudioRoute(
  state: RipplePaintState,
  routeSignal: AudioRouteSignal,
): RipplePaintState {
  return {
    ripples: state.ripples.map((ripple) =>
      updateRippleFromAudioRoute(ripple, routeSignal),
    ),
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
