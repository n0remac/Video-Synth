import type { ColorControlMessage } from "@/features/network/protocolTypes"
import {
  emptyColorControlState,
  receiveColorControl,
  resolveBackgroundColor,
  resolveDrawColor,
} from "./colorControlLogic"
import type { ColorControlState } from "./colorControlTypes"

export class ColorControlModule {
  id = "color-control"

  private state: ColorControlState = emptyColorControlState

  receiveInput(input: ColorControlMessage) {
    this.state = receiveColorControl(this.state, input)
  }

  resolveDrawColor(userId: string, fallbackColor: string, userRole?: string) {
    return resolveDrawColor(this.state, userId, fallbackColor, userRole)
  }

  resolveBackgroundColor(fallbackColor: string) {
    return resolveBackgroundColor(this.state, fallbackColor)
  }

  update() {}

  dispose() {}
}
