# Stage 2: Module Architecture

## Goal

Refactor the MVP into a stable module architecture without changing the core user experience. Ripple Paint remains the only required visual effect, but its boundaries become the template for later modules.

## Project Layout

```txt
cooperative-visualizer/
├── package.json
├── next.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── stage/page.tsx
│   │   ├── controller/page.tsx
│   │   └── patch/page.tsx
│   │
│   ├── features/
│   │   ├── stage/
│   │   │   ├── StageView.tsx
│   │   │   ├── useStageRuntime.ts
│   │   │   ├── stageTypes.ts
│   │   │   ├── stageConfig.ts
│   │   │   ├── render/
│   │   │   ├── modules/
│   │   │   └── patches/
│   │   │
│   │   ├── controller/
│   │   ├── network/
│   │   └── patch/
│   │
│   ├── shared/
│   │   ├── math/
│   │   ├── color/
│   │   └── time/
│   │
│   └── server/
```

## File Organization Rules

Code should start close to where it is used. Ripple-specific helpers stay in:

```txt
src/features/stage/modules/ripplePaint/
```

Only lift code into `shared/` when at least two feature areas use it.

Good shared candidates:

```txt
shared/math/clamp.ts
shared/math/lerp.ts
shared/color/palettes.ts
shared/time/deltaTime.ts
```

Avoid unrelated helper dumping:

```txt
shared/utils.ts
```

## Module File Pattern

Each visual module follows this pattern:

```txt
moduleName/
├── ModuleNameModule.ts   // module adapter and lifecycle
├── moduleNameTypes.ts    // types only
├── moduleNameLogic.ts    // pure functions
├── moduleNameThree.ts    // Three.js object creation/mutation
└── index.ts              // exports
```

Example:

```txt
ripplePaint/
├── RipplePaintModule.ts
├── ripplePaintTypes.ts
├── ripplePaintLogic.ts
├── ripplePaintThree.ts
└── index.ts
```

## Stage Module Types

```ts
export type StageRuntime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  modules: StageModule[]
}

export type StageModule = {
  id: string
  update(dt: number): void
  dispose(): void
}

export type InputReceivingModule<TInput> = StageModule & {
  receiveInput(input: TInput): void
}
```

## Functional Boundaries

Pure files should avoid side effects:

```txt
ripplePaintLogic.ts
colorPaletteLogic.ts
noiseFieldLogic.ts
patchTypes.ts
applyPatch.ts
roomState.ts
protocol.ts
shared/math/*
shared/color/*
```

Side-effect files may touch external systems:

```txt
useStageRuntime.ts
animationLoop.ts
ripplePaintThree.ts
RipplePaintModule.ts
useControllerSocket.ts
usePointerController.ts
websocketServer.ts
createRenderer.ts
```

## Signal Types

The patching system is based on typed signal outputs and typed parameter inputs:

```ts
export type SignalType =
  | "value"
  | "point"
  | "vector"
  | "color"
  | "palette"
  | "image"
  | "mask"
  | "trigger"
  | "field"
```

Signal meanings:

| Type | Meaning |
| --- | --- |
| `value` | number, usually 0-1 |
| `point` | x/y coordinate |
| `vector` | direction and magnitude |
| `color` | color value |
| `palette` | function or lookup from value to color |
| `image` | rendered texture or layer |
| `mask` | black/white or alpha image |
| `trigger` | event pulse |
| `field` | value/vector across the whole screen |

## Patch Model

The full patch system comes later, but the typed model should mature in this stage:

```ts
export type SignalName =
  | "pointer.position"
  | "pointer.speed"
  | "pointer.velocity"
  | "user.color"
  | "time.elapsed"
  | "time.delta"
  | "noise.value"
  | "noise.field"

export type ParameterName =
  | "ripple.position"
  | "ripple.radius"
  | "ripple.color"
  | "ripple.opacity"
  | "ripple.wobble"
  | "feedback.amount"
  | "noise.scale"
  | "noise.speed"
```

```ts
export type PatchConnection = {
  from: SignalName
  to: ParameterName
  amount?: number
  enabled?: boolean
}

export type PatchDefinition = {
  id: string
  name: string
  connections: PatchConnection[]
}
```

## Better Server Routing

After the MVP relay works, clients should identify their role:

```ts
export type ClientRole = "controller" | "stage" | "patch"
```

Then the server can route messages more intentionally:

```txt
controller -> stage
patch -> stage
stage -> patch/controller status
```

## Room State

```ts
export type RoomState = {
  users: Record<string, UserState>
  stages: Record<string, StageClientState>
}

export type UserState = {
  id: string
  color: string
  name?: string
  connectedAt: number
  lastSeenAt: number
}
```

## Acceptance Criteria

```txt
Ripple Paint follows the module file pattern
stage runtime owns rendering and browser side effects
pure ripple logic is covered by tests
protocol and patch types are centralized
room state is managed through pure reducers
client role routing exists or is ready behind protocol types
```
