# Stage 1: MVP Patch

## Goal

Build the smallest local network visual instrument:

> Multiple users connect, choose or receive colors, touch or drag on their controllers, and generate animated color ripples on a shared stage.

This stage proves the core application path before introducing a full module graph.

## User Experience

### Stage User

The stage user opens:

```txt
/stage
```

The page displays a fullscreen Three.js canvas. It receives controller messages and renders shared visuals.

### Controller User

Each participant opens:

```txt
/controller
```

The controller page includes:

```txt
connection status
touch pad
current color
color picker
intensity slider
clear button
```

When the user touches or drags, visual events appear on the stage.

## MVP Effect: Ripple Paint

The first effect is:

> Touch-controlled color ripples with fading trails.

Each pointer event creates a circle or ring at the normalized pointer location. The ripple expands and fades over time. The color comes from the user's assigned color or selected palette color. Drag speed can influence ripple size.

## MVP Patch

The initial patch is hardcoded data:

```txt
pointer.position -> ripple.position
pointer.speed    -> ripple.radius
user.color       -> ripple.color
time             -> ripple.expansion
age              -> ripple.opacity
```

The default patch type should exist now, even if it is not editable:

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
```

## Build Scope

Build:

```txt
Next.js app with TypeScript
/stage route
/controller route
fullscreen Three.js renderer
orthographic camera
RipplePaintModule
local stage mouse input for early testing
controller touch pad
color picker
intensity slider
shared message protocol
WebSocket relay
multi-user color assignment
default patch object
```

Do not build:

```txt
full visual patch editor
complex shader graph
real framebuffer feedback
Three Nebula integration
3D scene editor
account/login system
persistent cloud storage
video streaming
advanced permissions
mobile app wrapper
complex multiplayer rooms
```

## Recommended Stack

```txt
Next.js
React
TypeScript
Three.js
Node.js WebSocket server
ws or Socket.IO
Zustand or local reducer state
Raspberry Pi 5 target
```

## Runtime Architecture

```txt
Raspberry Pi or host computer
├── Next.js app
│   ├── /controller
│   ├── /stage
│   └── /patch
│
├── WebSocket server
│   ├── receives controller messages
│   ├── assigns users
│   └── broadcasts input to stage
│
└── Chromium fullscreen
    └── /stage
        └── Three.js renderer
```

Controllers do not render the final visuals:

```txt
phones/controllers -> WebSocket messages -> stage browser -> Three.js output
```

## MVP File Checklist

```txt
src/app/stage/page.tsx
src/app/controller/page.tsx

src/features/stage/StageView.tsx
src/features/stage/useStageRuntime.ts
src/features/stage/stageConfig.ts

src/features/stage/render/createRenderer.ts
src/features/stage/render/createScene.ts
src/features/stage/render/createCamera.ts
src/features/stage/render/animationLoop.ts

src/features/stage/modules/ripplePaint/RipplePaintModule.ts
src/features/stage/modules/ripplePaint/ripplePaintTypes.ts
src/features/stage/modules/ripplePaint/ripplePaintLogic.ts
src/features/stage/modules/ripplePaint/ripplePaintThree.ts
src/features/stage/modules/ripplePaint/index.ts

src/features/controller/ControllerView.tsx
src/features/controller/usePointerController.ts
src/features/controller/useControllerSocket.ts
src/features/controller/controllerTypes.ts
src/features/controller/components/TouchPad.tsx
src/features/controller/components/ColorPicker.tsx

src/features/network/protocol.ts
src/features/network/protocolTypes.ts
src/features/network/messageValidation.ts

src/features/stage/patches/defaultPatch.ts
src/features/stage/patches/patchTypes.ts

src/shared/math/clamp.ts
src/shared/math/lerp.ts
src/shared/math/vector.ts

src/server/websocketServer.ts
src/server/roomState.ts
src/server/userRegistry.ts
```

## Message Protocol

```ts
export type VisualizerMessage =
  | PointerMessage
  | UserJoinedMessage
  | UserLeftMessage
  | UserUpdatedMessage
  | PatchChangedMessage
  | ClearStageMessage
```

Pointer coordinates are normalized:

```ts
export type PointerMessage = {
  type: "pointer"
  userId: string
  x: number
  y: number
  vx: number
  vy: number
  speed: number
  down: boolean
  color: string
  timestamp: number
}
```

```txt
x: 0 to 1
y: 0 to 1
```

Core user messages:

```ts
export type UserJoinedMessage = {
  type: "user_joined"
  userId: string
  color: string
  timestamp: number
}

export type UserLeftMessage = {
  type: "user_left"
  userId: string
  timestamp: number
}

export type UserUpdatedMessage = {
  type: "user_updated"
  userId: string
  color?: string
  name?: string
  timestamp: number
}

export type ClearStageMessage = {
  type: "clear_stage"
  userId: string
  timestamp: number
}

export type PatchChangedMessage = {
  type: "patch_changed"
  patchId: string
  patch: PatchDefinition
  timestamp: number
}
```

## Controller Flow

```txt
DOM pointer event
  -> normalize pointer position
  -> calculate velocity
  -> create pointer message
  -> send WebSocket message
```

Start with:

```txt
30 messages per second per active user
```

## Server Flow

For the MVP, all clients can connect to the same WebSocket server and receive all messages:

```txt
controller sends pointer
server broadcasts pointer to everyone
stage receives pointer
controller ignores pointer messages from others
```

Server responsibilities:

```txt
accept controller connections
accept stage connections
assign user IDs
validate messages
broadcast pointer messages to stage clients
optionally broadcast user state to all clients
```

## Stage Flow

```txt
receive pointer message
  -> convert message to ripple input
  -> pure state update
  -> update Three.js objects
  -> render frame
```

Use normalized controller coordinates:

```txt
x: 0 left, 1 right
y: 0 top, 1 bottom
```

Map to stage world coordinates:

```txt
worldX = (x - 0.5) * stageWidth
worldY = (0.5 - y) * stageHeight
```

Use an orthographic camera for the first version because it keeps 2D mapping simple.

## Ripple Paint State

```ts
export type Ripple = {
  id: string
  userId: string
  x: number
  y: number
  radius: number
  maxRadius: number
  opacity: number
  age: number
  lifetime: number
  color: string
}

export type RippleInput = {
  id: string
  userId: string
  x: number
  y: number
  speed: number
  color: string
}

export type RipplePaintState = {
  ripples: Ripple[]
}
```

## Pure Ripple Functions

```ts
createRipple(input: RippleInput): Ripple

updateRipple(ripple: Ripple, dt: number): Ripple

updateRipplePaintState(
  state: RipplePaintState,
  dt: number
): RipplePaintState

addRipple(
  state: RipplePaintState,
  input: RippleInput
): RipplePaintState
```

## Three.js Side Effects

```ts
createRippleMesh(ripple: Ripple): THREE.Mesh

applyRippleToMesh(
  mesh: THREE.Mesh,
  ripple: Ripple
): void

disposeRippleMesh(mesh: THREE.Mesh): void
```

## Stage Runtime Lifecycle

```txt
mount StageView
  -> create renderer
  -> create scene
  -> create camera
  -> create modules
  -> open WebSocket
  -> start animation loop

unmount StageView
  -> stop animation loop
  -> close WebSocket
  -> dispose modules
  -> dispose renderer
```

## Acceptance Criteria

Version 0.1 is complete when:

```txt
/stage renders fullscreen Three.js visuals
/controller works on a phone
at least two users can connect at once
each user has a unique color
touching or dragging on the controller creates ripples on the stage
ripples fade without leaking old meshes
pointer messages use a typed protocol
ripple logic is separated from Three.js rendering code
the project has a default patch definition
the app can run locally on a Raspberry Pi or development computer
```
