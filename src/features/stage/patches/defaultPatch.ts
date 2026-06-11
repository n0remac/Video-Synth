import type { PatchDefinition } from "./patchTypes"

export const defaultPatch: PatchDefinition = {
  id: "ripple-paint-default",
  name: "Ripple Paint",
  connections: [
    {
      from: "pointer.position",
      to: "ripple.position",
      enabled: true,
    },
    {
      from: "pointer.speed",
      to: "ripple.radius",
      amount: 1,
      enabled: true,
    },
    {
      from: "user.color",
      to: "ripple.color",
      enabled: true,
    },
  ],
}
