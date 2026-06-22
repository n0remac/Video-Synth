import type {
  ShapeSpiralMotionSettings,
  ShapeVector3,
} from "../../../shapeGenerator/shapeGeneratorTypes"
import type {
  VisualCvModulationSource,
  VisualCvRouteSignal,
} from "../../../visualCv/visualCvTypes"
import type {
  SpiralMotionInstance,
  SpiralMotionInstanceTransform,
  SpiralMotionPathSample,
  SpiralMotionRuntimeState,
  SpiralMotionUpdateResult,
  SpiralMotionWorldSize,
} from "./spiralMotionTypes"

const millisecondsPerSecond = 1000

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1)

  return t * t * (3 - 2 * t)
}

function toRadians(degrees: number) {
  return (degrees / 180) * Math.PI
}

function getDirectionSign(direction: ShapeSpiralMotionSettings["direction"]) {
  return direction === "clockwise" ? -1 : 1
}

function getSpiralCvModulationValue(
  signal: VisualCvRouteSignal,
  source: VisualCvModulationSource,
) {
  if (source === "smooth") {
    return signal.smooth
  }

  if (source === "envelope") {
    return signal.envelope
  }

  if (source === "syncSine") {
    return signal.syncSine
  }

  if (source === "rise") {
    return signal.riseAmount
  }

  if (source === "fall") {
    return signal.fallAmount
  }

  if (source === "motion") {
    return signal.motion
  }

  return signal.level
}

export function getSpiralPathCount(settings: ShapeSpiralMotionSettings) {
  return clamp(Math.round(settings.pathCount), 1, 64)
}

export function getSpiralPathDurationMs(settings: ShapeSpiralMotionSettings) {
  return Math.max(settings.pathDurationMs ?? settings.resetMs ?? 4000, 250)
}

export function getSpiralSpawnRateHz(settings: ShapeSpiralMotionSettings) {
  return clamp(settings.spawnRateHz ?? 0.5, 0, 20)
}

export function getSpiralMoveRate(settings: ShapeSpiralMotionSettings) {
  return clamp(settings.moveRate ?? 1, 0, 20)
}

export function getSpiralMaxActiveShapes(settings: ShapeSpiralMotionSettings) {
  return clamp(
    Math.round(settings.maxActiveShapes),
    getSpiralPathCount(settings),
    512,
  )
}

export function getSpiralEdgePadding(settings: ShapeSpiralMotionSettings) {
  return clamp(settings.edgePadding, 0, 0.5)
}

export function createSpiralMotionRuntimeState(): SpiralMotionRuntimeState {
  return {
    instances: [],
    spawnElapsedMs: 0,
    accumulatedPulse: 0,
    lastFrequencyHz: 0,
    nextInstanceId: 1,
    hasSpawnedInitialRing: false,
  }
}

export function getSpiralPathAngleDegrees(
  settings: ShapeSpiralMotionSettings,
  pathIndex: number,
) {
  return (
    settings.startPhaseDegrees +
    pathIndex * (360 / getSpiralPathCount(settings))
  )
}

export function getSpiralPathAnglesDegrees(
  settings: ShapeSpiralMotionSettings,
) {
  return Array.from({ length: getSpiralPathCount(settings) }, (_, pathIndex) =>
    getSpiralPathAngleDegrees(settings, pathIndex),
  )
}

export function getSpiralEffectiveRadiusScale(
  settings: ShapeSpiralMotionSettings,
  signal: VisualCvRouteSignal | null,
) {
  const modulation = signal
    ? getSpiralCvModulationValue(signal, settings.radiusSource)
    : 0

  return Math.max(settings.startRadius + modulation * settings.radiusCvAmount, 0)
}

function getSpiralNonNegativeModulationValue(
  signal: VisualCvRouteSignal | null,
  source: VisualCvModulationSource,
  fallback: number,
) {
  if (!signal) {
    return fallback
  }

  return Math.max(getSpiralCvModulationValue(signal, source), 0)
}

function getPulseSyncedAdvanceRate({
  multiplier,
  signal,
  source,
}: {
  multiplier: number
  signal: VisualCvRouteSignal | null
  source: VisualCvModulationSource
}) {
  const frequencyHz = Math.max(signal?.frequencyHz ?? 0, 0)

  if (frequencyHz <= 0 || multiplier <= 0) {
    return 0
  }

  return (
    frequencyHz *
    getSpiralNonNegativeModulationValue(signal, source, 0) *
    multiplier
  )
}

function getScreenRadii(
  world: SpiralMotionWorldSize,
  settings: ShapeSpiralMotionSettings,
) {
  const edgePadding = getSpiralEdgePadding(settings)

  return {
    x: Math.max(world.worldWidth / 2 - edgePadding, 0),
    y: Math.max(world.worldHeight / 2 - edgePadding, 0),
  }
}

function spawnRing({
  accumulatedPulse,
  instances,
  nextInstanceId,
  settings,
}: {
  accumulatedPulse: number
  instances: SpiralMotionInstance[]
  nextInstanceId: number
  settings: ShapeSpiralMotionSettings
}) {
  const nextInstances = [...instances]
  let nextId = nextInstanceId

  for (let pathIndex = 0; pathIndex < getSpiralPathCount(settings); pathIndex += 1) {
    nextInstances.push({
      id: `spiral-${nextId}`,
      pathIndex,
      ageMs: 0,
      bornAtPulse: accumulatedPulse,
    })
    nextId += 1
  }

  return {
    instances: nextInstances,
    nextInstanceId: nextId,
  }
}

function pruneOldestInstances(
  instances: SpiralMotionInstance[],
  settings: ShapeSpiralMotionSettings,
) {
  const maxActiveShapes = getSpiralMaxActiveShapes(settings)

  if (instances.length <= maxActiveShapes) {
    return instances
  }

  return instances.slice(instances.length - maxActiveShapes)
}

export function updateSpiralMotionRuntimeState({
  dt,
  settings,
  signal,
  state,
}: {
  dt: number
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  state: SpiralMotionRuntimeState
}): SpiralMotionUpdateResult {
  const elapsedSeconds = Math.max(dt, 0)
  const frequencyHz = Math.max(signal?.frequencyHz ?? 0, 0)
  const accumulatedPulse = state.accumulatedPulse + frequencyHz * elapsedSeconds
  const lastFrequencyHz =
    frequencyHz > 0 ? frequencyHz : state.lastFrequencyHz
  const pathDurationMs = getSpiralPathDurationMs(settings)
  const moveAdvanceMs =
    elapsedSeconds *
    millisecondsPerSecond *
    getPulseSyncedAdvanceRate({
      multiplier: getSpiralMoveRate(settings),
      signal,
      source: settings.moveSource ?? "syncSine",
    })
  let instances = state.instances
    .map((instance) => ({
      ...instance,
      ageMs: instance.ageMs + moveAdvanceMs,
    }))
    .filter((instance) => instance.ageMs < pathDurationMs)
  let spawnElapsedMs = state.spawnElapsedMs
  let nextInstanceId = state.nextInstanceId
  let hasSpawnedInitialRing = state.hasSpawnedInitialRing
  let spawned = false

  if (!hasSpawnedInitialRing) {
    const result = spawnRing({
      accumulatedPulse,
      instances,
      nextInstanceId,
      settings,
    })

    instances = result.instances
    nextInstanceId = result.nextInstanceId
    spawnElapsedMs = 0
    hasSpawnedInitialRing = true
    spawned = true
  }

  const spawnRateHz = getSpiralSpawnRateHz(settings)

  if (spawnRateHz > 0) {
    spawnElapsedMs +=
      elapsedSeconds *
      millisecondsPerSecond *
      getPulseSyncedAdvanceRate({
        multiplier: spawnRateHz,
        signal,
        source: settings.spawnSource ?? "syncSine",
      })

    while (spawnElapsedMs >= millisecondsPerSecond) {
      spawnElapsedMs -= millisecondsPerSecond

      const result = spawnRing({
        accumulatedPulse,
        instances,
        nextInstanceId,
        settings,
      })

      instances = result.instances
      nextInstanceId = result.nextInstanceId
      spawned = true
    }
  } else {
    spawnElapsedMs = 0
  }

  instances = pruneOldestInstances(instances, settings)

  return {
    spawned,
    state: {
      instances,
      spawnElapsedMs,
      accumulatedPulse,
      lastFrequencyHz,
      nextInstanceId,
      hasSpawnedInitialRing,
    },
  }
}

export function getSpiralInstanceTransform({
  instance,
  origin,
  settings,
  signal,
  state,
  world,
}: {
  instance: SpiralMotionInstance
  origin: ShapeVector3
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  state: SpiralMotionRuntimeState
  world: SpiralMotionWorldSize
}): SpiralMotionInstanceTransform {
  const pathDurationMs = getSpiralPathDurationMs(settings)
  const progress = clamp(instance.ageMs / pathDurationMs, 0, 1)
  const radiusScale =
    getSpiralEffectiveRadiusScale(settings, signal) * (1 - smoothstep(progress))
  const screenRadii = getScreenRadii(world, settings)
  const pulsesSinceBirth = Math.max(state.accumulatedPulse - instance.bornAtPulse, 0)
  const phaseDegrees =
    getSpiralPathAngleDegrees(settings, instance.pathIndex) +
    getDirectionSign(settings.direction) *
      settings.degreesPerPulse *
      pulsesSinceBirth
  const phaseRadians = toRadians(phaseDegrees)

  return {
    id: instance.id,
    pathIndex: instance.pathIndex,
    position: {
      x: origin.x + Math.cos(phaseRadians) * screenRadii.x * radiusScale,
      y: origin.y + Math.sin(phaseRadians) * screenRadii.y * radiusScale,
      z: origin.z - settings.depthPerPulse * pulsesSinceBirth,
    },
    phaseDegrees,
    progress,
    pulsesSinceBirth,
  }
}

export function getSpiralInstanceTransforms({
  origin,
  settings,
  signal,
  state,
  world,
}: {
  origin: ShapeVector3
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  state: SpiralMotionRuntimeState
  world: SpiralMotionWorldSize
}) {
  return state.instances.map((instance) =>
    getSpiralInstanceTransform({
      instance,
      origin,
      settings,
      signal,
      state,
      world,
    }),
  )
}

export function getSpiralSpawnCycleProgress(
  settings: ShapeSpiralMotionSettings,
  state: SpiralMotionRuntimeState,
) {
  const spawnRateHz = getSpiralSpawnRateHz(settings)

  if (spawnRateHz <= 0) {
    return 0
  }

  return clamp(state.spawnElapsedMs / millisecondsPerSecond, 0, 1)
}

export function sampleSpiralPaths({
  frequencyHz,
  origin,
  sampleCount = 96,
  settings,
  signal,
  world,
}: {
  frequencyHz: number
  origin: ShapeVector3
  sampleCount?: number
  settings: ShapeSpiralMotionSettings
  signal: VisualCvRouteSignal | null
  world: SpiralMotionWorldSize
}): SpiralMotionPathSample[] {
  const count = Math.max(Math.floor(sampleCount), 2)
  const pathDurationSeconds =
    getSpiralPathDurationMs(settings) / millisecondsPerSecond
  const effectiveFrequencyHz = Math.max(frequencyHz, 0)
  const radiusScaleBase = getSpiralEffectiveRadiusScale(settings, signal)
  const screenRadii = getScreenRadii(world, settings)
  const direction = getDirectionSign(settings.direction)
  const movementPerPulse =
    getSpiralNonNegativeModulationValue(
      signal,
      settings.moveSource ?? "syncSine",
      1,
    ) * getSpiralMoveRate(settings)

  return Array.from(
    { length: getSpiralPathCount(settings) },
    (_, pathIndex) => ({
      pathIndex,
      samples: Array.from({ length: count }, (_, index) => {
        const progress = index / (count - 1)
        const pulsesSinceBirth =
          movementPerPulse > 0
            ? (progress * pathDurationSeconds) / movementPerPulse
            : effectiveFrequencyHz * progress * pathDurationSeconds
        const radiusScale = radiusScaleBase * (1 - smoothstep(progress))
        const phaseDegrees =
          getSpiralPathAngleDegrees(settings, pathIndex) +
          direction * settings.degreesPerPulse * pulsesSinceBirth
        const phaseRadians = toRadians(phaseDegrees)

        return {
          x: origin.x + Math.cos(phaseRadians) * screenRadii.x * radiusScale,
          y: origin.y + Math.sin(phaseRadians) * screenRadii.y * radiusScale,
          z: origin.z - settings.depthPerPulse * pulsesSinceBirth,
          progress,
        }
      }),
    }),
  )
}
