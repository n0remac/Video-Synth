import * as THREE from "three"
import type { AudioCircleSettings } from "@/features/network/protocolTypes"
import type { ShapeVector3 } from "@/features/shapeGenerator/shapeGeneratorTypes"
import type { StageModule } from "@/features/stage/stageTypes"
import type { VisualCvRouteSignal } from "@/features/visualCv/visualCvTypes"
import {
  createSpiralMotionRuntimeState,
  getSpiralInitialRingTransforms,
  getSpiralInstanceTransforms,
  getSpiralSpawnCycleProgress,
  sampleSpiralPaths,
  shouldResetSpiralMotionRuntime,
  updateSpiralMotionRuntimeState,
} from "./spiralMotionLogic"
import type {
  SpiralMotionInstanceTransform,
  SpiralMotionRuntimeState,
  SpiralMotionWorldSize,
} from "./spiralMotionTypes"
import {
  applySpiralPathToLine,
  createSpiralPathLine,
  disposeSpiralPathLine,
  type SpiralPathLine,
} from "./spiralMotionThree"

type SpiralMotionModuleOptions = {
  scene: THREE.Scene
  world: SpiralMotionWorldSize
}

export class SpiralMotionModule implements StageModule {
  id = "spiral-motion"

  private activeAudioInstanceId: string | null = null

  private audioSettingsByInstanceId = new Map<string, AudioCircleSettings>()

  private routeSignalsByInstanceId = new Map<string, VisualCvRouteSignal>()

  private statesByInstanceId = new Map<string, SpiralMotionRuntimeState>()

  private pathLines: SpiralPathLine[] = []

  constructor(private options: SpiralMotionModuleOptions) {}

  receiveAudioSettings(audioInstanceId: string, settings: AudioCircleSettings) {
    const previousSettings = this.audioSettingsByInstanceId.get(audioInstanceId)

    this.audioSettingsByInstanceId.set(audioInstanceId, settings)

    if (
      previousSettings?.centerShape.positionMode !==
        settings.centerShape.positionMode ||
      shouldResetSpiralMotionRuntime({
        previousSettings: previousSettings?.centerShape.spiralMotion ?? null,
        nextSettings: settings.centerShape.spiralMotion,
      })
    ) {
      this.statesByInstanceId.set(
        audioInstanceId,
        createSpiralMotionRuntimeState(),
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

    if (
      !audioInstanceId ||
      !settings?.centerShape.enabled ||
      settings.centerShape.positionMode !== "spiral" ||
      !settings.centerShape.spiralMotion.enabled
    ) {
      this.hidePathLines()
      return
    }

    const state = this.getState(audioInstanceId)
    const signal = this.routeSignalsByInstanceId.get(audioInstanceId) ?? null
    const result = updateSpiralMotionRuntimeState({
      dt,
      settings: settings.centerShape.spiralMotion,
      signal,
      state,
    })

    this.statesByInstanceId.set(audioInstanceId, result.state)
    this.syncPath()
  }

  getInstanceTransforms(
    audioInstanceId: string,
    origin: ShapeVector3,
  ): SpiralMotionInstanceTransform[] {
    const settings = this.audioSettingsByInstanceId.get(audioInstanceId)

    if (
      !settings ||
      settings.centerShape.positionMode !== "spiral" ||
      !settings.centerShape.spiralMotion.enabled
    ) {
      return []
    }

    return getSpiralInstanceTransforms({
      origin,
      settings: settings.centerShape.spiralMotion,
      signal: this.routeSignalsByInstanceId.get(audioInstanceId) ?? null,
      state: this.getState(audioInstanceId),
      world: this.options.world,
    })
  }

  getInitialRingTransforms(
    audioInstanceId: string,
    origin: ShapeVector3,
  ): SpiralMotionInstanceTransform[] {
    const settings = this.audioSettingsByInstanceId.get(audioInstanceId)

    if (!settings || !settings.centerShape.spiralMotion.enabled) {
      return []
    }

    return getSpiralInitialRingTransforms({
      origin,
      settings: settings.centerShape.spiralMotion,
      signal: this.routeSignalsByInstanceId.get(audioInstanceId) ?? null,
      world: this.options.world,
    })
  }

  getSpawnCycleProgress(audioInstanceId: string) {
    const settings = this.audioSettingsByInstanceId.get(audioInstanceId)

    if (!settings) {
      return 0
    }

    return getSpiralSpawnCycleProgress(
      settings.centerShape.spiralMotion,
      this.getState(audioInstanceId),
    )
  }

  resetRuntimeState(audioInstanceId: string) {
    this.statesByInstanceId.set(
      audioInstanceId,
      createSpiralMotionRuntimeState(),
    )
    this.syncPath()
  }

  dispose() {
    this.clearPathLines()
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

  private getState(audioInstanceId: string): SpiralMotionRuntimeState {
    const existingState = this.statesByInstanceId.get(audioInstanceId)

    if (existingState) {
      return existingState
    }

    const state = createSpiralMotionRuntimeState()

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
      this.hidePathLines()
      return
    }

    const state = this.getState(audioInstanceId)
    const signal = this.routeSignalsByInstanceId.get(audioInstanceId) ?? null
    const frequencyHz = state.lastFrequencyHz || signal?.frequencyHz || 1
    const pathSamples = sampleSpiralPaths({
      frequencyHz,
      origin: settings.centerShape.position,
      settings: settings.centerShape.spiralMotion,
      signal,
      world: this.options.world,
    })

    this.ensurePathLineCount(pathSamples.length)

    pathSamples.forEach((pathSample, index) => {
      const line = this.pathLines[index]

      applySpiralPathToLine(line, pathSample.samples)
      line.visible = true
    })

    for (let index = pathSamples.length; index < this.pathLines.length; index += 1) {
      this.pathLines[index].visible = false
    }
  }

  private ensurePathLineCount(count: number) {
    while (this.pathLines.length < count) {
      const line = createSpiralPathLine()

      this.pathLines.push(line)
      this.options.scene.add(line)
    }
  }

  private hidePathLines() {
    this.pathLines.forEach((line) => {
      line.visible = false
    })
  }

  private clearPathLines() {
    for (const line of this.pathLines) {
      this.options.scene.remove(line)
      disposeSpiralPathLine(line)
    }

    this.pathLines = []
  }
}
