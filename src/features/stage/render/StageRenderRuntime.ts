"use client"

import * as THREE from "three"
import type {
  AudioAnalysisFrame,
  AudioCircleSettings,
  AudioRouteSignal,
  ColorControlMessage,
  PointerMessage,
} from "@/features/network/protocolTypes"
import {
  defaultTriggeredCircleRouting,
  defaultVisualCvSettings,
} from "@/features/visualCv/visualCvDefaults"
import {
  createRoutedAudioRouteSignal,
  getVisualCvModulationValue,
  isVisualCvTriggerActive,
  updateVisualCvRouteSignal,
} from "@/features/visualCv/visualCvLogic"
import type { VisualCvRouteState } from "@/features/visualCv/visualCvLogic"
import { normalizeAudioControlledShapeSettings } from "@/features/shapeGenerator/shapeGeneratorTypes"
import { stageConfig, type StageConfig } from "@/features/stage/stageConfig"
import { ColorControlModule } from "@/features/stage/modules/colorControl"
import { CenterShapeModule } from "@/features/stage/modules/centerShape"
import { RipplePaintModule } from "@/features/stage/modules/ripplePaint"
import { SpiralMotionModule } from "@/features/stage/modules/spiralMotion"
import { TrailPaintModule } from "@/features/stage/modules/trailPaint"
import { startAnimationLoop, type AnimationLoopHandle } from "./animationLoop"
import { createCamera, resizeCameraToViewport } from "./createCamera"
import { createRenderer, type StageRenderCanvas } from "./createRenderer"
import { createScene } from "./createScene"
import type { StageRenderMode, StageRenderViewport } from "./stageRenderProtocol"

type StageRenderRuntimeOptions = StageRenderViewport & {
  canvas: StageRenderCanvas
  config?: StageConfig
  mode?: StageRenderMode
}

function messageToRippleInput(
  message: PointerMessage,
  world: { worldWidth: number; worldHeight: number },
  color: string,
) {
  return {
    id: `${message.userId}-${message.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    userId: message.userId,
    x: (message.x - 0.5) * world.worldWidth,
    y: (0.5 - message.y) * world.worldHeight,
    speed: message.speed,
    color,
  }
}

function messageToTrailInput(
  message: PointerMessage,
  world: { worldWidth: number; worldHeight: number },
  color: string,
) {
  return {
    userId: message.userId,
    x: (message.x - 0.5) * world.worldWidth,
    y: (0.5 - message.y) * world.worldHeight,
    vx: message.vx * world.worldWidth,
    vy: -message.vy * world.worldHeight,
    color,
    down: message.down,
    lineCount: message.trailLineCount,
    trailLength: message.trailLength,
  }
}

export class StageRenderRuntime {
  readonly mode: StageRenderMode

  private readonly config: StageConfig

  private readonly renderer: THREE.WebGLRenderer

  private readonly scene: THREE.Scene

  private readonly camera: THREE.PerspectiveCamera

  private readonly world: { worldWidth: number; worldHeight: number }

  private readonly colorControl: ColorControlModule

  private readonly spiralMotion: SpiralMotionModule

  private readonly centerShape: CenterShapeModule

  private readonly ripplePaint: RipplePaintModule

  private readonly trailPaint: TrailPaintModule

  private readonly audioRouteSettings = new Map<string, AudioCircleSettings>()

  private readonly visualCvRouteStates = new Map<string, VisualCvRouteState>()

  private readonly loop: AnimationLoopHandle

  constructor({
    canvas,
    config = stageConfig,
    height,
    mode = "main",
    pixelRatio,
    width,
  }: StageRenderRuntimeOptions) {
    this.mode = mode
    this.config = config
    this.renderer = createRenderer({ canvas, height, pixelRatio, width })
    this.scene = createScene()
    this.scene.background = new THREE.Color(config.backgroundColor)
    this.camera = createCamera(config.worldHeight)
    this.world = resizeCameraToViewport(this.camera, config.worldHeight, {
      height,
      width,
    })
    this.colorControl = new ColorControlModule()
    this.spiralMotion = new SpiralMotionModule({
      scene: this.scene,
      world: this.world,
    })
    this.centerShape = new CenterShapeModule({
      scene: this.scene,
      spiralMotion: this.spiralMotion,
    })
    this.ripplePaint = new RipplePaintModule({
      scene: this.scene,
      maxRipples: config.maxRipples,
    })
    this.trailPaint = new TrailPaintModule({ scene: this.scene })
    this.loop = startAnimationLoop((dt) => this.update(dt))
  }

  resize({ height, pixelRatio, width }: StageRenderViewport) {
    this.renderer.setPixelRatio(Math.min(pixelRatio, 2))
    this.renderer.setSize(width, height, false)
    Object.assign(
      this.world,
      resizeCameraToViewport(this.camera, this.config.worldHeight, {
        height,
        width,
      }),
    )
  }

  receiveAudioSettings(audioInstanceId: string, settings: AudioCircleSettings) {
    const normalizedSettings = {
      ...settings,
      centerShape: normalizeAudioControlledShapeSettings(settings.centerShape),
    }

    this.audioRouteSettings.set(audioInstanceId, normalizedSettings)
    this.visualCvRouteStates.delete(audioInstanceId)
    this.spiralMotion.receiveAudioSettings(audioInstanceId, normalizedSettings)
    this.centerShape.receiveAudioSettings(audioInstanceId, normalizedSettings)
  }

  removeAudioInstance(audioInstanceId: string) {
    this.audioRouteSettings.delete(audioInstanceId)
    this.visualCvRouteStates.delete(audioInstanceId)
    this.spiralMotion.removeAudioInstance(audioInstanceId)
    this.centerShape.removeAudioInstance(audioInstanceId)
  }

  receiveAudioFrame(frame: AudioAnalysisFrame) {
    frame.routes?.forEach((routeSignal: AudioRouteSignal) => {
      const settings = this.audioRouteSettings.get(routeSignal.audioInstanceId)

      if (!settings) {
        return
      }

      const visualCvResult = updateVisualCvRouteSignal({
        routeSignal,
        settings: settings.visualCv ?? defaultVisualCvSettings,
        state:
          this.visualCvRouteStates.get(routeSignal.audioInstanceId) ?? null,
        timestamp: frame.timestamp,
      })
      const visualCvSignal = visualCvResult.signal
      const circleRouting =
        settings.triggeredCircles ?? defaultTriggeredCircleRouting
      const routedRouteSignal = createRoutedAudioRouteSignal({
        routeSignal,
        routing: circleRouting,
        visualCvSignal,
      })

      this.visualCvRouteStates.set(
        routeSignal.audioInstanceId,
        visualCvResult.state,
      )
      this.spiralMotion.receiveVisualCvRouteSignal(visualCvSignal)
      this.centerShape.receiveVisualCvRouteSignal(visualCvSignal)
      this.ripplePaint.receiveAudioRouteSignal(routedRouteSignal)

      if (!isVisualCvTriggerActive(visualCvSignal, circleRouting.triggerSource)) {
        return
      }

      const level = getVisualCvModulationValue(
        visualCvSignal,
        circleRouting.sizeSource,
      )
      const riseAmount = getVisualCvModulationValue(
        visualCvSignal,
        circleRouting.growSource,
      )
      const fallAmount = getVisualCvModulationValue(
        visualCvSignal,
        circleRouting.releaseSource,
      )
      const hasAudioMotion =
        settings.circleGrowOnRise === true ||
        settings.circleFadeOnFall === true ||
        settings.circleShrinkOnFall === true ||
        settings.circleLevelControlsSize === true

      this.ripplePaint.receiveInput({
        id: `audio-${routeSignal.audioInstanceId}-${frame.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        userId: routeSignal.audioInstanceId,
        x: (Math.random() - 0.5) * this.world.worldWidth,
        y: (0.5 - Math.random()) * this.world.worldHeight,
        speed: level * 4,
        color: settings.circleColor,
        audioMotion: hasAudioMotion
          ? {
              audioInstanceId: routeSignal.audioInstanceId,
              growOnRise: settings.circleGrowOnRise,
              fadeOnFall: settings.circleFadeOnFall,
              shrinkOnFall: settings.circleShrinkOnFall,
              level,
              riseAmount,
              fallAmount,
              levelControlsSize: settings.circleLevelControlsSize,
            }
          : undefined,
      })
    })
  }

  receivePointer(message: PointerMessage) {
    const color = this.colorControl.resolveDrawColor(
      message.userId,
      message.color,
      message.userRole,
    )

    if (message.visualMode === "circle" && message.down) {
      this.ripplePaint.receiveInput(messageToRippleInput(message, this.world, color))
    }

    if (message.visualMode === "line") {
      this.trailPaint.receiveInput(messageToTrailInput(message, this.world, color))
    }
  }

  receiveColorControl(message: ColorControlMessage) {
    this.colorControl.receiveInput(message)
    this.scene.background = new THREE.Color(
      this.colorControl.resolveBackgroundColor(this.config.backgroundColor),
    )
  }

  clear() {
    this.ripplePaint.clear()
    this.trailPaint.clear()
  }

  resetVisualCvRouteStates() {
    this.visualCvRouteStates.clear()
  }

  dispose() {
    this.loop.stop()
    this.colorControl.dispose()
    this.centerShape.dispose()
    this.spiralMotion.dispose()
    this.ripplePaint.dispose()
    this.trailPaint.dispose()
    this.renderer.dispose()
  }

  private update(dt: number) {
    this.ripplePaint.update(dt)
    this.trailPaint.update(dt)
    this.spiralMotion.update(dt)
    this.centerShape.update(dt)
    this.colorControl.update()
    this.scene.background = new THREE.Color(
      this.colorControl.resolveBackgroundColor(this.config.backgroundColor),
    )
    this.renderer.render(this.scene, this.camera)
  }
}
