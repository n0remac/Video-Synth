import * as THREE from "three"
import type { InputReceivingModule } from "@/features/stage/stageTypes"
import type { AudioRouteSignal } from "@/features/network/protocolTypes"
import {
  addRipple,
  updateRipplePaintState,
  updateRipplePaintStateFromAudioRoute,
} from "./ripplePaintLogic"
import {
  applyRippleToMesh,
  createRippleMesh,
  disposeRippleMesh,
} from "./ripplePaintThree"
import type { RippleInput, RipplePaintState } from "./ripplePaintTypes"

export type RipplePaintModuleOptions = {
  scene: THREE.Scene
  maxRipples: number
}

export class RipplePaintModule
  implements InputReceivingModule<RippleInput>
{
  id = "ripple-paint"

  private state: RipplePaintState = {
    ripples: [],
  }

  private meshes = new Map<string, THREE.Mesh>()

  constructor(private options: RipplePaintModuleOptions) {}

  receiveInput(input: RippleInput) {
    this.state = addRipple(this.state, input, this.options.maxRipples)
    this.syncMeshes()
  }

  receiveAudioRouteSignal(routeSignal: AudioRouteSignal) {
    this.state = updateRipplePaintStateFromAudioRoute(this.state, routeSignal)
  }

  clear() {
    this.state = { ripples: [] }
    this.syncMeshes()
  }

  update(dt: number) {
    this.state = updateRipplePaintState(this.state, dt)
    this.syncMeshes()
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      this.options.scene.remove(mesh)
      disposeRippleMesh(mesh)
    }

    this.meshes.clear()
  }

  private syncMeshes() {
    const liveIds = new Set(this.state.ripples.map((ripple) => ripple.id))

    for (const [id, mesh] of this.meshes) {
      if (!liveIds.has(id)) {
        this.options.scene.remove(mesh)
        disposeRippleMesh(mesh)
        this.meshes.delete(id)
      }
    }

    for (const ripple of this.state.ripples) {
      let mesh = this.meshes.get(ripple.id)

      if (!mesh) {
        mesh = createRippleMesh(ripple)
        this.meshes.set(ripple.id, mesh)
        this.options.scene.add(mesh)
      }

      applyRippleToMesh(mesh, ripple)
    }
  }
}
