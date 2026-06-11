import * as THREE from "three"
import type { InputReceivingModule } from "@/features/stage/stageTypes"
import { addTrailPoint, updateTrailPaintState } from "./trailPaintLogic"
import {
  applyTrailToLines,
  createTrailLine,
  disposeTrailLine,
  type TrailLine,
} from "./trailPaintThree"
import type { TrailPaintInput, TrailPaintState } from "./trailPaintTypes"

export type TrailPaintModuleOptions = {
  scene: THREE.Scene
}

export class TrailPaintModule implements InputReceivingModule<TrailPaintInput> {
  id = "trail-paint"

  private state: TrailPaintState = {
    trails: {},
  }

  private lines = new Map<string, TrailLine[]>()
  private elapsedTime = 0

  constructor(private options: TrailPaintModuleOptions) {}

  receiveInput(input: TrailPaintInput) {
    this.state = addTrailPoint(this.state, input)
    this.syncLines()
  }

  clear() {
    this.state = { trails: {} }
    this.syncLines()
  }

  update(dt: number) {
    this.elapsedTime += dt
    this.state = updateTrailPaintState(this.state, dt)
    this.syncLines()
  }

  dispose() {
    for (const lines of this.lines.values()) {
      for (const line of lines) {
        this.options.scene.remove(line)
        disposeTrailLine(line)
      }
    }

    this.lines.clear()
  }

  private syncLines() {
    const liveUserIds = new Set(Object.keys(this.state.trails))

    for (const [userId, lines] of this.lines) {
      if (!liveUserIds.has(userId)) {
        for (const line of lines) {
          this.options.scene.remove(line)
          disposeTrailLine(line)
        }
        this.lines.delete(userId)
      }
    }

    for (const trail of Object.values(this.state.trails)) {
      let lines = this.lines.get(trail.userId) ?? []

      while (lines.length > trail.lineCount) {
        const line = lines.pop()
        if (line) {
          this.options.scene.remove(line)
          disposeTrailLine(line)
        }
      }

      while (lines.length < trail.lineCount) {
        const line = createTrailLine(trail.color)
        lines.push(line)
        this.options.scene.add(line)
      }

      this.lines.set(trail.userId, lines)
      applyTrailToLines(lines, trail, this.elapsedTime)
    }
  }
}
