import * as THREE from "three"
import type {
  AudioCircleSettings,
} from "@/features/network/protocolTypes"
import type {
  AudioControlledShapeSettings,
  ShapeControlName,
  ShapeParameters,
  ShapeVector3,
} from "@/features/shapeGenerator/shapeGeneratorTypes"
import type { VisualCvRouteSignal } from "@/features/visualCv/visualCvTypes"
import { getVisualCvModulationValue } from "@/features/visualCv/visualCvLogic"
import {
  applyShapeColor,
  buildShape,
  clearGroup,
  clamp,
  createShapeFillGeometry,
  disposeObject,
  getNearestPolyhedronSideCount,
} from "@/features/shapeGenerator/shapeGeneratorThree"
import type { StageModule } from "@/features/stage/stageTypes"
import type { SpiralMotionModule } from "../spiralMotion"
import type { SpiralMotionInstanceTransform } from "../spiralMotion/spiralMotionTypes"
import {
  getSpiralGeometryParameters,
  getSpiralGeometrySignature,
  getSpiralInstanceScale,
} from "./centerShapeGeometryLogic"
import {
  advanceCenterShapeTransition,
  createManualToSpiralTransition,
  createSpiralToManualTransition,
  getCenterShapeTransitionProgress,
  getManualToSpiralTransitionTransforms,
  getSpiralToManualTransitionTransforms,
  type CenterShapePositionModeTransition,
} from "./centerShapeTransitionLogic"

type CenterShapeModuleOptions = {
  scene: THREE.Scene
  spiralMotion: SpiralMotionModule
}

type ShapeControlRange = {
  min: number
  max: number
  integer?: boolean
}

type ContinuousMotionState = {
  elapsedMs: number
  offset: number
}

type SpiralShapeBatch = {
  capacity: number
  color: string
  fill: THREE.InstancedMesh
  fillMaterial: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  geometry: THREE.BufferGeometry
  signature: string
  wire: THREE.InstancedMesh
  wireMaterial: THREE.MeshBasicMaterial
}

const stageShapeScale = 0.22
const spiralGeometryCacheLimit = 32

const positionControlNames: ShapeControlName[] = [
  "positionX",
  "positionY",
  "positionZ",
]

const continuousMotionControlNames: ShapeControlName[] = [
  ...positionControlNames,
  "rotationX",
  "rotationY",
  "rotationZ",
]

const shapeControlRanges: Record<ShapeControlName, ShapeControlRange> = {
  angleBias: { min: -1, max: 1 },
  bevel: { min: 0, max: 0.25 },
  colorHue: { min: -360, max: 360 },
  depth: { min: 0.2, max: 3 },
  positionX: { min: -1.5, max: 1.5 },
  positionY: { min: -1, max: 1 },
  positionZ: { min: -2, max: 2 },
  rotationX: { min: -180, max: 180 },
  rotationY: { min: -180, max: 180 },
  rotationZ: { min: -180, max: 180 },
  sideVariation: { min: 0, max: 1 },
  sides: { min: 3, max: 24, integer: true },
  size: { min: 0.7, max: 2.6 },
  taper: { min: 0.2, max: 1.8 },
  twist: { min: -180, max: 180 },
}

const shapeParameterNames: Array<keyof ShapeParameters> = [
  "angleBias",
  "bevel",
  "depth",
  "sideVariation",
  "sides",
  "size",
  "taper",
  "twist",
]

function getMotionValue(
  shape: AudioControlledShapeSettings,
  controlName: ShapeControlName,
  signal: VisualCvRouteSignal | null,
) {
  const mapping = shape.motionMappings[controlName]

  if (!mapping.enabled || mapping.mode === "continuous" || !signal) {
    return 0
  }

  const routedValue =
    mapping.source === "rise-fall"
      ? (signal.riseAmount - signal.fallAmount) * mapping.amount
      : getVisualCvModulationValue(signal, mapping.source) * mapping.amount

  return mapping.invert ? -routedValue : routedValue
}

function applyControlRange(
  value: number,
  controlName: ShapeControlName,
  shape: AudioControlledShapeSettings,
) {
  const range = shapeControlRanges[controlName]
  const clampedValue = clamp(value, range.min, range.max)

  if (controlName === "sides") {
    if (shape.mode === "3d" && shape.family === "polyhedron") {
      return getNearestPolyhedronSideCount(clampedValue)
    }

    return Math.round(clampedValue)
  }

  return range.integer ? Math.round(clampedValue) : clampedValue
}

function getBaseControlValue(
  shape: AudioControlledShapeSettings,
  controlName: ShapeControlName,
) {
  switch (controlName) {
    case "colorHue":
      return 0
    case "positionX":
      return shape.position.x
    case "positionY":
      return shape.position.y
    case "positionZ":
      return shape.position.z
    case "rotationX":
      return shape.rotation.x
    case "rotationY":
      return shape.rotation.y
    case "rotationZ":
      return shape.rotation.z
    default:
      return shape.parameters[controlName]
  }
}

function getEffectiveControlValue(
  shape: AudioControlledShapeSettings,
  controlName: ShapeControlName,
  signal: VisualCvRouteSignal | null,
  continuousOffsets: Partial<Record<ShapeControlName, number>>,
) {
  const mapping = shape.motionMappings[controlName]
  const value =
    getBaseControlValue(shape, controlName) +
    getMotionValue(shape, controlName, signal) +
    (continuousOffsets[controlName] ?? 0)

  if (
    mapping.mode === "continuous" &&
    continuousMotionControlNames.includes(controlName)
  ) {
    return value
  }

  return applyControlRange(
    value,
    controlName,
    shape,
  )
}

function getEffectiveShape(
  shape: AudioControlledShapeSettings,
  signal: VisualCvRouteSignal | null,
  continuousOffsets: Partial<Record<ShapeControlName, number>>,
  spiralPosition: ShapeVector3 | null = null,
) {
  const parameters = shapeParameterNames.reduce((nextParameters, parameterName) => {
    nextParameters[parameterName] = getEffectiveControlValue(
      shape,
      parameterName,
      signal,
      continuousOffsets,
    )

    return nextParameters
  }, {} as ShapeParameters)

  return {
    color: getEffectiveColor(shape, signal),
    family: shape.family,
    mode: shape.mode,
    parameters,
    position: spiralPosition ?? {
      x: getEffectiveControlValue(shape, "positionX", signal, continuousOffsets),
      y: getEffectiveControlValue(shape, "positionY", signal, continuousOffsets),
      z: getEffectiveControlValue(shape, "positionZ", signal, continuousOffsets),
    },
    rotation: {
      x: getEffectiveControlValue(shape, "rotationX", signal, continuousOffsets),
      y: getEffectiveControlValue(shape, "rotationY", signal, continuousOffsets),
      z: getEffectiveControlValue(shape, "rotationZ", signal, continuousOffsets),
    },
  }
}

function getEffectiveColor(
  shape: AudioControlledShapeSettings,
  signal: VisualCvRouteSignal | null,
) {
  const hueOffset = getEffectiveControlValue(shape, "colorHue", signal, {})

  if (hueOffset === 0) {
    return shape.color
  }

  return `#${new THREE.Color(shape.color).offsetHSL(hueOffset / 360, 0, 0).getHexString()}`
}

export type EffectiveShape = ReturnType<typeof getEffectiveShape>

function toRadians(degrees: number) {
  return (degrees / 180) * Math.PI
}

function applyShapeTransform(shapeObject: THREE.Object3D, shape: EffectiveShape) {
  shapeObject.scale.setScalar(stageShapeScale)
  shapeObject.position.set(shape.position.x, shape.position.y, shape.position.z)
  shapeObject.rotation.set(
    toRadians(shape.rotation.x),
    toRadians(shape.rotation.y),
    toRadians(shape.rotation.z),
  )
}

function getManualGeometrySignature(shape: EffectiveShape) {
  return JSON.stringify({
    family: shape.family,
    mode: shape.mode,
    parameters: shape.parameters,
  })
}

function getSpiralBatchCapacity(requiredCount: number) {
  return Math.max(Math.ceil(Math.max(requiredCount, 1) / 32) * 32, 32)
}

function getTransformSignature(shape: EffectiveShape) {
  return JSON.stringify({
    position: shape.position,
    rotation: shape.rotation,
  })
}

function withShapePosition(
  shape: EffectiveShape,
  position: ShapeVector3,
): EffectiveShape {
  return {
    ...shape,
    position,
  }
}

export class CenterShapeModule implements StageModule {
  id = "center-shape"

  private root = new THREE.Group()

  private lights: THREE.Light[] = []

  private activeAudioInstanceId: string | null = null

  private audioSettingsByInstanceId = new Map<string, AudioCircleSettings>()

  private routeSignalsByInstanceId = new Map<string, VisualCvRouteSignal>()

  private continuousMotionByControlName = new Map<
    ShapeControlName,
    ContinuousMotionState
  >()

  private positionModeTransitionsByInstanceId =
    new Map<string, CenterShapePositionModeTransition>()

  private completedPositionModeTransitions = new Set<string>()

  private lastManualPositionByInstanceId = new Map<string, ShapeVector3>()

  private lastSpiralTransformsByInstanceId =
    new Map<string, SpiralMotionInstanceTransform[]>()

  private shapeObject: THREE.Object3D | null = null

  private spiralShapeBatch: SpiralShapeBatch | null = null

  private spiralGeometryCache = new Map<string, THREE.BufferGeometry>()

  private renderedGeometrySignature = ""

  private renderedTransformSignature = ""

  constructor(private options: CenterShapeModuleOptions) {
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.25)
    const rimLight = new THREE.DirectionalLight(0xff8f3c, 0.9)
    const fillLight = new THREE.HemisphereLight(0x8ee6ff, 0x050505, 1.25)

    keyLight.position.set(1.2, 1.5, 2.5)
    rimLight.position.set(-2, 1, -1.5)
    this.lights = [keyLight, rimLight, fillLight]
    this.options.scene.add(this.root, ...this.lights)
  }

  receiveAudioSettings(audioInstanceId: string, settings: AudioCircleSettings) {
    const previousSettings = this.audioSettingsByInstanceId.get(audioInstanceId)
    const previousActiveAudioInstanceId = this.activeAudioInstanceId

    this.audioSettingsByInstanceId.set(audioInstanceId, settings)

    if (settings.centerShape.enabled) {
      this.activeAudioInstanceId = audioInstanceId
    } else if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
    }

    if (previousActiveAudioInstanceId !== this.activeAudioInstanceId) {
      this.continuousMotionByControlName.clear()
    } else {
      this.pruneContinuousMotion(settings.centerShape)
    }

    this.startPositionModeTransition(
      audioInstanceId,
      previousSettings ?? null,
      settings,
    )
    this.syncShape()
  }

  removeAudioInstance(audioInstanceId: string) {
    this.audioSettingsByInstanceId.delete(audioInstanceId)
    this.routeSignalsByInstanceId.delete(audioInstanceId)
    this.positionModeTransitionsByInstanceId.delete(audioInstanceId)
    this.completedPositionModeTransitions.delete(audioInstanceId)
    this.lastManualPositionByInstanceId.delete(audioInstanceId)
    this.lastSpiralTransformsByInstanceId.delete(audioInstanceId)

    if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
      this.continuousMotionByControlName.clear()
    }

    this.syncShape()
  }

  receiveVisualCvRouteSignal(routeSignal: VisualCvRouteSignal) {
    this.routeSignalsByInstanceId.set(routeSignal.audioInstanceId, routeSignal)

    if (routeSignal.audioInstanceId === this.activeAudioInstanceId) {
      this.syncShape()
    }
  }

  update(dt: number) {
    const settings = this.activeAudioInstanceId
      ? this.audioSettingsByInstanceId.get(this.activeAudioInstanceId)
      : null
    const signal =
      this.routeSignalsByInstanceId.get(this.activeAudioInstanceId ?? "") ?? null

    if (!settings?.centerShape.enabled) {
      return
    }

    const usesSpiralMotion =
      settings.centerShape.positionMode === "spiral" &&
      settings.centerShape.spiralMotion.enabled
    const transitionChanged = this.activeAudioInstanceId
      ? this.updatePositionModeTransition(
          this.activeAudioInstanceId,
          dt,
        )
      : false
    const continuousMotionChanged = signal
      ? this.updateContinuousMotion(settings.centerShape, signal, dt)
      : false

    if (continuousMotionChanged || usesSpiralMotion || transitionChanged) {
      this.syncShape()
    }
  }

  dispose() {
    this.clearShape()
    this.clearSpiralGeometryCache()
    this.options.scene.remove(this.root, ...this.lights)
    this.lights = []
  }

  private getFirstEnabledAudioInstanceId() {
    for (const [audioInstanceId, settings] of this.audioSettingsByInstanceId) {
      if (settings.centerShape.enabled) {
        return audioInstanceId
      }
    }

    return null
  }

  private getContinuousMotionOffsets() {
    return Object.fromEntries(
      Array.from(this.continuousMotionByControlName.entries()).map(
        ([controlName, state]) => [controlName, state.offset],
      ),
    ) as Partial<Record<ShapeControlName, number>>
  }

  private pruneContinuousMotion(shape: AudioControlledShapeSettings) {
    for (const controlName of continuousMotionControlNames) {
      const mapping = shape.motionMappings[controlName]

      if (
        !mapping.enabled ||
        mapping.mode !== "continuous" ||
        (shape.positionMode === "spiral" &&
          positionControlNames.includes(controlName))
      ) {
        this.continuousMotionByControlName.delete(controlName)
      }
    }
  }

  private updateContinuousMotion(
    shape: AudioControlledShapeSettings,
    signal: VisualCvRouteSignal,
    dt: number,
  ) {
    const elapsedSeconds = Math.max(dt, 0)
    const elapsedMs = elapsedSeconds * 1000
    const frequencyHz = Math.max(signal.frequencyHz, 0)
    let changed = false

    this.pruneContinuousMotion(shape)

    if (elapsedSeconds === 0 || frequencyHz === 0) {
      return changed
    }

    for (const controlName of continuousMotionControlNames) {
      const mapping = shape.motionMappings[controlName]

      if (
        !mapping.enabled ||
        mapping.mode !== "continuous" ||
        (shape.positionMode === "spiral" &&
          positionControlNames.includes(controlName))
      ) {
        continue
      }

      const state =
        this.continuousMotionByControlName.get(controlName) ??
        ({
          elapsedMs: 0,
          offset: 0,
        } satisfies ContinuousMotionState)

      if (positionControlNames.includes(controlName)) {
        const resetMs = Math.max(mapping.resetMs, 0)

        state.elapsedMs += elapsedMs

        if (resetMs > 0 && state.elapsedMs >= resetMs) {
          state.elapsedMs %= resetMs
          state.offset = 0
        }
      }

      const direction = mapping.invert ? -1 : 1
      const nextOffset =
        state.offset + direction * mapping.amount * frequencyHz * elapsedSeconds

      if (nextOffset !== state.offset) {
        changed = true
      }

      state.offset = nextOffset
      this.continuousMotionByControlName.set(controlName, state)
    }

    return changed
  }

  private startPositionModeTransition(
    audioInstanceId: string,
    previousSettings: AudioCircleSettings | null,
    settings: AudioCircleSettings,
  ) {
    if (!previousSettings) {
      return
    }

    const previousShape = previousSettings.centerShape
    const nextShape = settings.centerShape

    if (previousShape.positionMode === nextShape.positionMode) {
      return
    }

    this.completedPositionModeTransitions.delete(audioInstanceId)

    if (
      previousShape.positionMode === "manual" &&
      nextShape.positionMode === "spiral" &&
      nextShape.spiralMotion.enabled
    ) {
      const origin =
        this.lastManualPositionByInstanceId.get(audioInstanceId) ??
        previousShape.position

      this.positionModeTransitionsByInstanceId.set(
        audioInstanceId,
        createManualToSpiralTransition({
          audioInstanceId,
          origin,
          settings: nextShape.spiralMotion,
        }),
      )
      return
    }

    if (
      previousShape.positionMode === "spiral" &&
      previousShape.spiralMotion.enabled &&
      nextShape.positionMode === "manual"
    ) {
      const startTransforms =
        this.lastSpiralTransformsByInstanceId.get(audioInstanceId) ?? []

      if (startTransforms.length === 0) {
        this.positionModeTransitionsByInstanceId.delete(audioInstanceId)
        return
      }

      this.positionModeTransitionsByInstanceId.set(
        audioInstanceId,
        createSpiralToManualTransition({
          audioInstanceId,
          settings: previousShape.spiralMotion,
          startTransforms,
        }),
      )
      return
    }

    this.positionModeTransitionsByInstanceId.delete(audioInstanceId)
  }

  private updatePositionModeTransition(
    audioInstanceId: string,
    dt: number,
  ) {
    const transition =
      this.positionModeTransitionsByInstanceId.get(audioInstanceId)

    if (!transition) {
      return false
    }

    if (this.completedPositionModeTransitions.has(audioInstanceId)) {
      this.completedPositionModeTransitions.delete(audioInstanceId)
      this.positionModeTransitionsByInstanceId.delete(audioInstanceId)
      return true
    }

    const result = advanceCenterShapeTransition({
      dt,
      transition,
    })

    this.positionModeTransitionsByInstanceId.set(
      audioInstanceId,
      result.transition,
    )

    if (result.done) {
      if (transition.direction === "spiral-to-manual") {
        this.positionModeTransitionsByInstanceId.delete(audioInstanceId)
        this.completedPositionModeTransitions.delete(audioInstanceId)
        return true
      }

      this.completedPositionModeTransitions.add(audioInstanceId)

      if (transition.direction === "manual-to-spiral") {
        this.options.spiralMotion.resetRuntimeState(audioInstanceId)
      }
    }

    return true
  }

  private syncShape() {
    const audioInstanceId = this.activeAudioInstanceId
    const settings = audioInstanceId
      ? this.audioSettingsByInstanceId.get(audioInstanceId)
      : null

    if (!settings?.centerShape.enabled) {
      this.clearShape()
      return
    }

    const signal =
      this.routeSignalsByInstanceId.get(audioInstanceId ?? "") ?? null
    const effectiveShape = getEffectiveShape(
      settings.centerShape,
      signal,
      this.getContinuousMotionOffsets(),
    )
    const transition = audioInstanceId
      ? this.positionModeTransitionsByInstanceId.get(audioInstanceId)
      : null

    if (audioInstanceId && transition) {
      const progress = getCenterShapeTransitionProgress({
        elapsedMs: transition.elapsedMs,
        settings: transition.settings,
      })
      const transforms =
        transition.direction === "manual-to-spiral"
          ? getManualToSpiralTransitionTransforms({
              progress,
              targetTransforms: this.options.spiralMotion.getInitialRingTransforms(
                audioInstanceId,
                settings.centerShape.position,
              ),
              transition,
            })
          : getSpiralToManualTransitionTransforms({
              progress,
              targetOrigin: effectiveShape.position,
              transition,
            })

      this.renderSpiralShapeTransforms({
        audioInstanceId,
        effectiveShape,
        geometrySignature: getSpiralGeometrySignature(effectiveShape),
        transforms,
      })
      return
    }

    if (
      settings.centerShape.positionMode === "spiral" &&
      settings.centerShape.spiralMotion.enabled &&
      audioInstanceId
    ) {
      this.syncSpiralShapes({
        audioInstanceId,
        effectiveShape,
        geometrySignature: getSpiralGeometrySignature(effectiveShape),
        origin: settings.centerShape.position,
      })
      return
    }

    if (audioInstanceId) {
      this.lastManualPositionByInstanceId.set(
        audioInstanceId,
        effectiveShape.position,
      )
    }
    this.syncManualShape(effectiveShape, getManualGeometrySignature(effectiveShape))
  }

  private syncManualShape(
    effectiveShape: EffectiveShape,
    geometrySignature: string,
  ) {
    this.clearSpiralShapes()

    if (
      !this.shapeObject ||
      geometrySignature !== this.renderedGeometrySignature
    ) {
      clearGroup(this.root)
      this.shapeObject = buildShape(effectiveShape)
      this.root.add(this.shapeObject)
      this.renderedGeometrySignature = geometrySignature
      this.renderedTransformSignature = ""
    }

    if (this.shapeObject) {
      applyShapeColor(this.shapeObject, effectiveShape.color)
    }

    const transformSignature = getTransformSignature(effectiveShape)

    if (
      this.shapeObject &&
      transformSignature !== this.renderedTransformSignature
    ) {
      applyShapeTransform(this.shapeObject, effectiveShape)
      this.renderedTransformSignature = transformSignature
    }
  }

  private syncSpiralShapes({
    audioInstanceId,
    effectiveShape,
    geometrySignature,
    origin,
  }: {
    audioInstanceId: string
    effectiveShape: EffectiveShape
    geometrySignature: string
    origin: ShapeVector3
  }) {
    const transforms = this.options.spiralMotion.getInstanceTransforms(
      audioInstanceId,
      origin,
    )

    this.renderSpiralShapeTransforms({
      audioInstanceId,
      effectiveShape,
      geometrySignature,
      transforms,
    })
  }

  private renderSpiralShapeTransforms({
    audioInstanceId,
    effectiveShape,
    geometrySignature,
    transforms,
  }: {
    audioInstanceId: string
    effectiveShape: EffectiveShape
    geometrySignature: string
    transforms: SpiralMotionInstanceTransform[]
  }) {
    this.clearManualShape()

    const batch = this.ensureSpiralShapeBatch(
      effectiveShape,
      geometrySignature,
      transforms.length,
    )
    const rotation = new THREE.Euler(
      toRadians(effectiveShape.rotation.x),
      toRadians(effectiveShape.rotation.y),
      toRadians(effectiveShape.rotation.z),
    )
    const quaternion = new THREE.Quaternion().setFromEuler(rotation)
    const sizeScale = getSpiralInstanceScale(effectiveShape)
    const scale = new THREE.Vector3(
      stageShapeScale * sizeScale.x,
      stageShapeScale * sizeScale.y,
      stageShapeScale * sizeScale.z,
    )
    const position = new THREE.Vector3()
    const matrix = new THREE.Matrix4()

    if (batch.color !== effectiveShape.color) {
      batch.fillMaterial.color.set(effectiveShape.color)
      batch.color = effectiveShape.color
    }

    transforms.forEach((transform, index) => {
      const shape = withShapePosition(effectiveShape, transform.position)
      position.set(shape.position.x, shape.position.y, shape.position.z)
      matrix.compose(position, quaternion, scale)
      batch.fill.setMatrixAt(index, matrix)
      batch.wire.setMatrixAt(index, matrix)
    })

    batch.fill.count = transforms.length
    batch.wire.count = transforms.length
    batch.fill.instanceMatrix.needsUpdate = true
    batch.wire.instanceMatrix.needsUpdate = true
    batch.fill.computeBoundingSphere()
    batch.wire.computeBoundingSphere()
    this.renderedGeometrySignature = geometrySignature

    this.renderedTransformSignature = ""
    this.lastSpiralTransformsByInstanceId.set(audioInstanceId, transforms)
  }

  private ensureSpiralShapeBatch(
    shape: EffectiveShape,
    geometrySignature: string,
    requiredCount: number,
  ) {
    const capacity = getSpiralBatchCapacity(requiredCount)

    if (
      this.spiralShapeBatch &&
      this.spiralShapeBatch.signature === geometrySignature &&
      this.spiralShapeBatch.capacity >= requiredCount
    ) {
      return this.spiralShapeBatch
    }

    this.disposeSpiralShapeBatch()

    const geometry = this.getCachedSpiralGeometry(geometrySignature, shape)
    const fillMaterial =
      shape.mode === "2d"
        ? new THREE.MeshBasicMaterial({
            color: shape.color,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: shape.color,
            metalness: 0.18,
            roughness: 0.48,
          })
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: shape.mode === "2d" ? 0.48 : 0.38,
      transparent: true,
      wireframe: true,
    })
    const fill = new THREE.InstancedMesh(geometry, fillMaterial, capacity)
    const wire = new THREE.InstancedMesh(geometry, wireMaterial, capacity)

    fill.frustumCulled = false
    wire.frustumCulled = false
    wire.renderOrder = 5
    this.root.add(fill, wire)

    this.spiralShapeBatch = {
      capacity,
      color: shape.color,
      fill,
      fillMaterial,
      geometry,
      signature: geometrySignature,
      wire,
      wireMaterial,
    }

    return this.spiralShapeBatch
  }

  private getCachedSpiralGeometry(
    geometrySignature: string,
    shape: EffectiveShape,
  ) {
    const existingGeometry = this.spiralGeometryCache.get(geometrySignature)

    if (existingGeometry) {
      this.spiralGeometryCache.delete(geometrySignature)
      this.spiralGeometryCache.set(geometrySignature, existingGeometry)
      return existingGeometry
    }

    const geometry = createShapeFillGeometry({
      family: shape.family,
      mode: shape.mode,
      parameters: getSpiralGeometryParameters(shape),
    })

    this.spiralGeometryCache.set(geometrySignature, geometry)
    this.pruneSpiralGeometryCache(geometrySignature)

    return geometry
  }

  private pruneSpiralGeometryCache(activeSignature: string) {
    while (this.spiralGeometryCache.size > spiralGeometryCacheLimit) {
      const oldestSignature = this.spiralGeometryCache.keys().next().value

      if (!oldestSignature || oldestSignature === activeSignature) {
        return
      }

      const geometry = this.spiralGeometryCache.get(oldestSignature)
      this.spiralGeometryCache.delete(oldestSignature)
      geometry?.dispose()
    }
  }

  private clearShape() {
    this.clearManualShape()
    this.clearSpiralShapes()
    this.renderedGeometrySignature = ""
    this.renderedTransformSignature = ""
  }

  private clearManualShape() {
    if (!this.shapeObject) {
      return
    }

    this.root.remove(this.shapeObject)
    disposeObject(this.shapeObject)
    this.shapeObject = null
    this.renderedTransformSignature = ""
  }

  private clearSpiralShapes() {
    this.disposeSpiralShapeBatch()
  }

  private disposeSpiralShapeBatch() {
    if (!this.spiralShapeBatch) {
      return
    }

    this.root.remove(this.spiralShapeBatch.fill, this.spiralShapeBatch.wire)
    this.spiralShapeBatch.fillMaterial.dispose()
    this.spiralShapeBatch.wireMaterial.dispose()
    this.spiralShapeBatch = null
  }

  private clearSpiralGeometryCache() {
    for (const geometry of this.spiralGeometryCache.values()) {
      geometry.dispose()
    }

    this.spiralGeometryCache.clear()
  }
}
