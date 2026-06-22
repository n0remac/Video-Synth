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
  disposeObject,
  getNearestPolyhedronSideCount,
} from "@/features/shapeGenerator/shapeGeneratorThree"
import type { StageModule } from "@/features/stage/stageTypes"
import type { SpiralMotionModule } from "../spiralMotion"

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

const stageShapeScale = 0.22

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

type EffectiveShape = ReturnType<typeof getEffectiveShape>

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

function getGeometrySignature(shape: EffectiveShape) {
  return JSON.stringify({
    family: shape.family,
    mode: shape.mode,
    parameters: shape.parameters,
  })
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

  private shapeObject: THREE.Object3D | null = null

  private spiralShapeObjects = new Map<string, THREE.Object3D>()

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

    this.syncShape()
  }

  removeAudioInstance(audioInstanceId: string) {
    this.audioSettingsByInstanceId.delete(audioInstanceId)
    this.routeSignalsByInstanceId.delete(audioInstanceId)

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
    const continuousMotionChanged = signal
      ? this.updateContinuousMotion(settings.centerShape, signal, dt)
      : false

    if (continuousMotionChanged || usesSpiralMotion) {
      this.syncShape()
    }
  }

  dispose() {
    this.clearShape()
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

  private syncShape() {
    const settings = this.activeAudioInstanceId
      ? this.audioSettingsByInstanceId.get(this.activeAudioInstanceId)
      : null

    if (!settings?.centerShape.enabled) {
      this.clearShape()
      return
    }

    const signal =
      this.routeSignalsByInstanceId.get(this.activeAudioInstanceId ?? "") ?? null
    const effectiveShape = getEffectiveShape(
      settings.centerShape,
      signal,
      this.getContinuousMotionOffsets(),
    )
    const geometrySignature = getGeometrySignature(effectiveShape)

    if (
      settings.centerShape.positionMode === "spiral" &&
      settings.centerShape.spiralMotion.enabled &&
      this.activeAudioInstanceId
    ) {
      this.syncSpiralShapes({
        audioInstanceId: this.activeAudioInstanceId,
        effectiveShape,
        geometrySignature,
        origin: settings.centerShape.position,
      })
      return
    }

    this.syncManualShape(effectiveShape, geometrySignature)
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
    this.clearManualShape()

    if (geometrySignature !== this.renderedGeometrySignature) {
      this.clearSpiralShapes()
      this.renderedGeometrySignature = geometrySignature
    }

    const transforms = this.options.spiralMotion.getInstanceTransforms(
      audioInstanceId,
      origin,
    )
    const liveIds = new Set(transforms.map((transform) => transform.id))

    for (const [id, shapeObject] of this.spiralShapeObjects) {
      if (!liveIds.has(id)) {
        this.root.remove(shapeObject)
        disposeObject(shapeObject)
        this.spiralShapeObjects.delete(id)
      }
    }

    for (const transform of transforms) {
      const shape = withShapePosition(effectiveShape, transform.position)
      let shapeObject = this.spiralShapeObjects.get(transform.id)

      if (!shapeObject) {
        shapeObject = buildShape(shape)
        this.spiralShapeObjects.set(transform.id, shapeObject)
        this.root.add(shapeObject)
      }

      applyShapeColor(shapeObject, shape.color)
      applyShapeTransform(shapeObject, shape)
    }

    this.renderedTransformSignature = ""
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
    for (const shapeObject of this.spiralShapeObjects.values()) {
      this.root.remove(shapeObject)
      disposeObject(shapeObject)
    }

    this.spiralShapeObjects.clear()
  }
}
