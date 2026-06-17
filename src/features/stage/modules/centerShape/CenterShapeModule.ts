import * as THREE from "three"
import type {
  AudioCircleSettings,
  AudioRouteSignal,
} from "@/features/network/protocolTypes"
import type {
  AudioControlledShapeSettings,
  ShapeControlName,
  ShapeParameters,
} from "@/features/shapeGenerator/shapeGeneratorTypes"
import {
  buildShape,
  clearGroup,
  clamp,
  getNearestPolyhedronSideCount,
} from "@/features/shapeGenerator/shapeGeneratorThree"
import type { StageModule } from "@/features/stage/stageTypes"

type CenterShapeModuleOptions = {
  scene: THREE.Scene
}

type ShapeControlRange = {
  min: number
  max: number
  integer?: boolean
}

const stageShapeScale = 0.22

const shapeControlRanges: Record<ShapeControlName, ShapeControlRange> = {
  angleBias: { min: -1, max: 1 },
  bevel: { min: 0, max: 0.25 },
  depth: { min: 0.2, max: 3 },
  rotation: { min: 0, max: 360 },
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
  signal: AudioRouteSignal | null,
) {
  const mapping = shape.motionMappings[controlName]

  if (!mapping.enabled || !signal) {
    return 0
  }

  const value =
    mapping.source === "level"
      ? signal.level * mapping.amount
      : (signal.riseAmount - signal.fallAmount) * mapping.amount

  return mapping.invert ? -value : value
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
  return controlName === "rotation"
    ? shape.rotation
    : shape.parameters[controlName]
}

function getEffectiveControlValue(
  shape: AudioControlledShapeSettings,
  controlName: ShapeControlName,
  signal: AudioRouteSignal | null,
) {
  return applyControlRange(
    getBaseControlValue(shape, controlName) +
      getMotionValue(shape, controlName, signal),
    controlName,
    shape,
  )
}

function getEffectiveShape(
  shape: AudioControlledShapeSettings,
  signal: AudioRouteSignal | null,
) {
  const parameters = shapeParameterNames.reduce((nextParameters, parameterName) => {
    nextParameters[parameterName] = getEffectiveControlValue(
      shape,
      parameterName,
      signal,
    )

    return nextParameters
  }, {} as ShapeParameters)

  return {
    family: shape.family,
    mode: shape.mode,
    parameters,
    rotation: getEffectiveControlValue(shape, "rotation", signal),
  }
}

export class CenterShapeModule implements StageModule {
  id = "center-shape"

  private root = new THREE.Group()

  private lights: THREE.Light[] = []

  private activeAudioInstanceId: string | null = null

  private audioSettingsByInstanceId = new Map<string, AudioCircleSettings>()

  private routeSignalsByInstanceId = new Map<string, AudioRouteSignal>()

  private renderedSignature = ""

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
    this.audioSettingsByInstanceId.set(audioInstanceId, settings)

    if (settings.centerShape.enabled) {
      this.activeAudioInstanceId = audioInstanceId
    } else if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
    }

    this.syncShape()
  }

  removeAudioInstance(audioInstanceId: string) {
    this.audioSettingsByInstanceId.delete(audioInstanceId)
    this.routeSignalsByInstanceId.delete(audioInstanceId)

    if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
    }

    this.syncShape()
  }

  receiveAudioRouteSignal(routeSignal: AudioRouteSignal) {
    this.routeSignalsByInstanceId.set(routeSignal.audioInstanceId, routeSignal)

    if (routeSignal.audioInstanceId === this.activeAudioInstanceId) {
      this.syncShape()
    }
  }

  update(_dt: number) {}

  dispose() {
    clearGroup(this.root)
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

  private syncShape() {
    const settings = this.activeAudioInstanceId
      ? this.audioSettingsByInstanceId.get(this.activeAudioInstanceId)
      : null

    if (!settings?.centerShape.enabled) {
      this.renderedSignature = ""
      clearGroup(this.root)
      return
    }

    const signal =
      this.routeSignalsByInstanceId.get(this.activeAudioInstanceId ?? "") ?? null
    const effectiveShape = getEffectiveShape(settings.centerShape, signal)
    const signature = JSON.stringify(effectiveShape)

    if (signature === this.renderedSignature) {
      return
    }

    this.renderedSignature = signature
    clearGroup(this.root)

    const shape = buildShape(effectiveShape)
    shape.scale.setScalar(stageShapeScale)
    this.root.add(shape)
  }
}
