import type { AudioCircleSettings } from "../../network/protocolTypes"

const shapeControlNames = [
  "angleBias",
  "bevel",
  "depth",
  "sideVariation",
  "sides",
  "size",
  "taper",
  "twist",
  "positionX",
  "positionY",
  "positionZ",
  "rotationX",
  "rotationY",
  "rotationZ",
  "colorHue",
] as const

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
}

function hexToRgb(value: string) {
  const hex = value.slice(1)

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`
}

function blendValue(from: unknown, to: unknown, amount: number): unknown {
  if (typeof from === "number" && typeof to === "number") {
    return lerp(from, to, amount)
  }

  if (isHexColor(from) && isHexColor(to)) {
    const start = hexToRgb(from)
    const end = hexToRgb(to)

    return rgbToHex({
      r: lerp(start.r, end.r, amount),
      g: lerp(start.g, end.g, amount),
      b: lerp(start.b, end.b, amount),
    })
  }

  if (isRecord(from) && isRecord(to)) {
    return Object.fromEntries(
      Object.entries(to).map(([key, targetValue]) => [
        key,
        blendValue(from[key], targetValue, amount),
      ]),
    )
  }

  return amount >= 1 ? to : from
}

function normalizeAudioSettings(settings: AudioCircleSettings): AudioCircleSettings {
  const pathCount = clamp(
    Math.round(settings.centerShape.spiralMotion.pathCount),
    1,
    64,
  )
  const maxActiveShapes = clamp(
    Math.round(settings.centerShape.spiralMotion.maxActiveShapes),
    pathCount,
    512,
  )
  const motionMappings = { ...settings.centerShape.motionMappings }

  for (const controlName of shapeControlNames) {
    const mapping = motionMappings[controlName]

    motionMappings[controlName] = {
      ...mapping,
      amount: clamp(mapping.amount, 0, 360),
      resetMs: Math.max(mapping.resetMs, 250),
    }
  }

  return {
    ...settings,
    sampleStartPercent: clamp(settings.sampleStartPercent, 0, 100),
    sampleEndPercent: clamp(settings.sampleEndPercent, 0, 100),
    triggerLevel: clamp(settings.triggerLevel, 0, 1),
    adaptiveSensitivity: clamp(settings.adaptiveSensitivity, 0, 1),
    adaptiveSpeed: clamp(settings.adaptiveSpeed, 0, 1),
    gain: clamp(settings.gain, 0.1, 6),
    cooldownMs: clamp(settings.cooldownMs, 50, 1200),
    visualCv: {
      smooth: {
        ...settings.visualCv.smooth,
        riseMs: clamp(settings.visualCv.smooth.riseMs, 0, 1500),
        fallMs: clamp(settings.visualCv.smooth.fallMs, 0, 1500),
      },
      envelope: {
        ...settings.visualCv.envelope,
        threshold: clamp(settings.visualCv.envelope.threshold, 0, 1),
        attackMs: clamp(settings.visualCv.envelope.attackMs, 0, 1500),
        decayMs: clamp(settings.visualCv.envelope.decayMs, 0, 3000),
        cooldownMs: clamp(settings.visualCv.envelope.cooldownMs, 0, 1200),
      },
      syncSine: {
        ...settings.visualCv.syncSine,
        threshold: clamp(settings.visualCv.syncSine.threshold, 0, 1),
        hysteresis: clamp(settings.visualCv.syncSine.hysteresis, 0, 1),
        cooldownMs: clamp(settings.visualCv.syncSine.cooldownMs, 0, 1200),
        lengthMultiple: clamp(settings.visualCv.syncSine.lengthMultiple, 0.25, 8),
        historyMs: clamp(settings.visualCv.syncSine.historyMs, 500, 12000),
        periodSmoothMs: clamp(settings.visualCv.syncSine.periodSmoothMs, 0, 3000),
        phaseCorrectionAmount: clamp(
          settings.visualCv.syncSine.phaseCorrectionAmount,
          0,
          1,
        ),
      },
    },
    centerShape: {
      ...settings.centerShape,
      parameters: {
        angleBias: clamp(settings.centerShape.parameters.angleBias, -1, 1),
        bevel: clamp(settings.centerShape.parameters.bevel, 0, 0.25),
        depth: clamp(settings.centerShape.parameters.depth, 0.2, 3),
        sideVariation: clamp(settings.centerShape.parameters.sideVariation, 0, 1),
        sides: clamp(Math.round(settings.centerShape.parameters.sides), 3, 24),
        size: clamp(settings.centerShape.parameters.size, 0.7, 2.6),
        taper: clamp(settings.centerShape.parameters.taper, 0.2, 1.8),
        twist: clamp(settings.centerShape.parameters.twist, -180, 180),
      },
      position: {
        x: clamp(settings.centerShape.position.x, -1.5, 1.5),
        y: clamp(settings.centerShape.position.y, -1, 1),
        z: clamp(settings.centerShape.position.z, -2, 2),
      },
      rotation: {
        x: clamp(settings.centerShape.rotation.x, -180, 180),
        y: clamp(settings.centerShape.rotation.y, -180, 180),
        z: clamp(settings.centerShape.rotation.z, -180, 180),
      },
      spiralMotion: {
        ...settings.centerShape.spiralMotion,
        startRadius: clamp(settings.centerShape.spiralMotion.startRadius, 0, 20),
        radiusCvAmount: clamp(
          settings.centerShape.spiralMotion.radiusCvAmount,
          0,
          20,
        ),
        moveRate: clamp(settings.centerShape.spiralMotion.moveRate, 0, 20),
        degreesPerPulse: clamp(
          settings.centerShape.spiralMotion.degreesPerPulse,
          0,
          3600,
        ),
        depthPerPulse: clamp(
          settings.centerShape.spiralMotion.depthPerPulse,
          0,
          100,
        ),
        pathDurationMs: Math.max(
          settings.centerShape.spiralMotion.pathDurationMs,
          250,
        ),
        pathCount,
        spawnRateHz: clamp(settings.centerShape.spiralMotion.spawnRateHz, 0, 20),
        maxActiveShapes,
        edgePadding: clamp(settings.centerShape.spiralMotion.edgePadding, 0, 0.5),
        startPhaseDegrees: clamp(
          settings.centerShape.spiralMotion.startPhaseDegrees,
          -3600,
          3600,
        ),
      },
      motionMappings,
    },
  }
}

function applyShapeModeTransitionBlend({
  amount,
  blended,
  from,
  to,
}: {
  amount: number
  blended: AudioCircleSettings
  from: AudioCircleSettings
  to: AudioCircleSettings
}): AudioCircleSettings {
  const fromMode = from.centerShape.positionMode
  const toMode = to.centerShape.positionMode

  if (amount <= 0 || amount >= 1 || fromMode === toMode) {
    return blended
  }

  return {
    ...blended,
    centerShape: {
      ...blended.centerShape,
      enabled: from.centerShape.enabled || to.centerShape.enabled,
      positionMode: toMode,
      spiralMotion: {
        ...blended.centerShape.spiralMotion,
        enabled:
          from.centerShape.spiralMotion.enabled ||
          to.centerShape.spiralMotion.enabled,
      },
    },
  }
}

export function blendAudioSettings(
  from: AudioCircleSettings,
  to: AudioCircleSettings,
  progress: number,
): AudioCircleSettings {
  const amount = clamp(progress, 0, 1)
  const blended = blendValue(from, to, amount) as AudioCircleSettings

  return normalizeAudioSettings(
    applyShapeModeTransitionBlend({
      amount,
      blended,
      from,
      to,
    }),
  )
}
