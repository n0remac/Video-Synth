import * as THREE from "three"
import type { AudioCircleSettings } from "@/features/network/protocolTypes"
import type { ShapeVector3 } from "@/features/shapeGenerator/shapeGeneratorTypes"
import type { StageModule } from "@/features/stage/stageTypes"
import type { VisualCvRouteSignal } from "@/features/visualCv/visualCvTypes"
import {
  createSpiralMotionState,
  getSpiralTransform,
  sampleSpiralPath,
  updateSpiralMotionState,
} from "./spiralMotionLogic"
import type {
  SpiralMotionState,
  SpiralMotionTransform,
} from "./spiralMotionTypes"
import {
  applySpiralPathToLine,
  createSpiralPathLine,
  disposeSpiralPathLine,
  type SpiralPathLine,
} from "./spiralMotionThree"

type SpiralMotionModuleOptions = {
  scene: THREE.Scene
}

export class SpiralMotionModule implements StageModule {
  id = "spiral-motion"

  private activeAudioInstanceId: string | null = null

  private audioSettingsByInstanceId = new Map<string, AudioCircleSettings>()

  private routeSignalsByInstanceId = new Map<string, VisualCvRouteSignal>()

  private statesByInstanceId = new Map<string, SpiralMotionState>()

  private pathLine: SpiralPathLine

  constructor(private options: SpiralMotionModuleOptions) {
    this.pathLine = createSpiralPathLine()
    this.options.scene.add(this.pathLine)
  }

  receiveAudioSettings(audioInstanceId: string, settings: AudioCircleSettings) {
    const previousSettings = this.audioSettingsByInstanceId.get(audioInstanceId)

    this.audioSettingsByInstanceId.set(audioInstanceId, settings)

    if (
      previousSettings?.centerShape.positionMode !==
        settings.centerShape.positionMode ||
      JSON.stringify(previousSettings?.centerShape.spiralMotion) !==
      JSON.stringify(settings.centerShape.spiralMotion)
    ) {
      this.statesByInstanceId.set(
        audioInstanceId,
        createSpiralMotionState(settings.centerShape.spiralMotion),
      )
    }

    if (settings.centerShape.enabled) {
      this.activeAudioInstanceId = audioInstanceId
    } else if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
    }

    this.syncPath()
  }

  removeAudioInstance(audioInstanceId: string) {
    this.audioSettingsByInstanceId.delete(audioInstanceId)
    this.routeSignalsByInstanceId.delete(audioInstanceId)
    this.statesByInstanceId.delete(audioInstanceId)

    if (this.activeAudioInstanceId === audioInstanceId) {
      this.activeAudioInstanceId = this.getFirstEnabledAudioInstanceId()
    }

    this.syncPath()
  }

  receiveVisualCvRouteSignal(routeSignal: VisualCvRouteSignal) {
    this.routeSignalsByInstanceId.set(routeSignal.audioInstanceId, routeSignal)

    if (routeSignal.audioInstanceId === this.activeAudioInstanceId) {
      this.syncPath()
    }
  }

  update(dt: number) {
    const audioInstanceId = this.activeAudioInstanceId
    const settings = audioInstanceId
      ? this.audioSettingsByInstanceId.get(audioInstanceId)
      : null

    if (!audioInstanceId || !settings?.centerShape.enabled) {
      this.pathLine.visible = false
      return
    }

    const spiralSettings = settings.centerShape.spiralMotion
    const state = this.getState(audioInstanceId, settings)

    if (
      settings.centerShape.positionMode === "spiral" &&
      spiralSettings.enabled
    ) {
      const signal = this.routeSignalsByInstanceId.get(audioInstanceId) ?? null

      this.statesByInstanceId.set(
        audioInstanceId,
        updateSpiralMotionState({
          dt,
          settings: spiralSettings,
          signal,
          state,
        }),
      )
    }

    this.syncPath()
  }

  getTransform(
    audioInstanceId: string,
    origin: ShapeVector3,
  ): SpiralMotionTransform | null {
    const settings = this.audioSettingsByInstanceId.get(audioInstanceId)

    if (!settings || settings.centerShape.positionMode !== "spiral") {
      return null
    }

    const spiralSettings = settings.centerShape.spiralMotion

    if (!spiralSettings.enabled) {
      return {
        position: { ...origin },
        phaseDegrees: spiralSettings.startPhaseDegrees,
        progress: 0,
        radius: 0,
        zOffset: 0,
        frequencyHz: 0,
      }
    }

    return getSpiralTransform({
      origin,
      settings: spiralSettings,
      signal: this.routeSignalsByInstanceId.get(audioInstanceId) ?? null,
      state: this.getState(audioInstanceId, settings),
    })
  }

  dispose() {
    this.options.scene.remove(this.pathLine)
    disposeSpiralPathLine(this.pathLine)
    this.statesByInstanceId.clear()
    this.audioSettingsByInstanceId.clear()
    this.routeSignalsByInstanceId.clear()
  }

  private getFirstEnabledAudioInstanceId() {
    for (const [audioInstanceId, settings] of this.audioSettingsByInstanceId) {
      if (settings.centerShape.enabled) {
        return audioInstanceId
      }
    }

    return null
  }

  private getState(
    audioInstanceId: string,
    settings: AudioCircleSettings,
  ): SpiralMotionState {
    const existingState = this.statesByInstanceId.get(audioInstanceId)

    if (existingState) {
      return existingState
    }

    const state = createSpiralMotionState(settings.centerShape.spiralMotion)

    this.statesByInstanceId.set(audioInstanceId, state)

    return state
  }

  private syncPath() {
    const audioInstanceId = this.activeAudioInstanceId
    const settings = audioInstanceId
      ? this.audioSettingsByInstanceId.get(audioInstanceId)
      : null

    if (
      !audioInstanceId ||
      !settings?.centerShape.enabled ||
      settings.centerShape.positionMode !== "spiral" ||
      !settings.centerShape.spiralMotion.enabled ||
      !settings.centerShape.spiralMotion.visualize
    ) {
      this.pathLine.visible = false
      return
    }

    const state = this.getState(audioInstanceId, settings)
    const signal = this.routeSignalsByInstanceId.get(audioInstanceId) ?? null
    const frequencyHz = state.lastFrequencyHz || signal?.frequencyHz || 1
    const samples = sampleSpiralPath({
      frequencyHz,
      origin: settings.centerShape.position,
      settings: settings.centerShape.spiralMotion,
      signal,
    })

    applySpiralPathToLine(this.pathLine, samples)
    this.pathLine.visible = true
  }
}
