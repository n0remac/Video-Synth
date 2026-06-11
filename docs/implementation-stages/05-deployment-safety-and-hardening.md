# Stage 5: Deployment, Safety, And Hardening

## Goal

Prepare Signal Paint for reliable local projection, especially on a Raspberry Pi target.

## Rendering Constraints

Use a performance budget suitable for Raspberry Pi projection.

Initial performance goals:

| Target | Goal |
| --- | --- |
| Resolution | 720p first, 1080p later |
| FPS | 30-60 fps |
| Users | 2-10 users initially |
| Pointer messages | around 30 Hz per active user |
| Ripples | cap at 500 or fewer |
| Particles | avoid until core works |

Optimization rules:

```txt
do not send pixels over the network
do not render visuals on phones
keep WebSocket messages small
avoid creating too much geometry per frame
dispose geometries and materials
cap live ripple count
consider mesh pooling after first version
use instancing later if many shapes are needed
prefer shader-based effects for large full-screen visuals
start simple before adding postprocessing
```

## Renderer Defaults

```ts
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
})

renderer.setClearColor(0x000000, 1)
```

Recommended stage resolution:

```txt
start: 1280x720
target: 1920x1080
avoid initially: 4K
```

## Configuration

Stage config:

```ts
export type StageConfig = {
  backgroundColor: string
  targetFps: number
  maxRipples: number
  worldWidth: number
  worldHeight: number
}

export const stageConfig: StageConfig = {
  backgroundColor: "#000000",
  targetFps: 60,
  maxRipples: 500,
  worldWidth: 2,
  worldHeight: 1.125,
}
```

Controller config:

```ts
export type ControllerConfig = {
  pointerMessageHz: number
  defaultColor: string
}

export const controllerConfig: ControllerConfig = {
  pointerMessageHz: 30,
  defaultColor: "#ff00cc",
}
```

## Error Handling

Controller status:

```txt
Disconnected
Connecting...
Connected
Stage unavailable
```

If disconnected, the controller can keep UI active but should not pretend messages are being sent.

Stage behavior when the WebSocket disconnects:

```txt
show small connection warning
continue local animation
attempt reconnect
```

Server behavior:

```txt
ignore invalid messages without crashing
log invalid message type
log malformed payload
log unknown role
log client disconnected
```

## Testing Strategy

Focus tests on pure logic first:

```txt
updateRipple
addRipple
updateRipplePaintState
normalizePointerPosition
calculatePointerVelocity
createPointerMessage
validateMessage
roomState reducers
applyPatch
```

Example tests:

```txt
updateRipple increases age
updateRipple reduces opacity over lifetime
expired ripples are removed
pointer position normalizes correctly
velocity is calculated correctly
invalid messages are rejected
room state adds/removes users correctly
```

Manual visual tests:

```txt
stage loads without errors
canvas resizes correctly
ripples appear at correct position
ripples fade smoothly
memory does not grow unbounded
multiple users do not break framerate
```

## Raspberry Pi Deployment Target

Recommended hardware:

```txt
Raspberry Pi 5
active cooling
reliable power supply
HDMI display/projector
Ethernet or strong Wi-Fi
```

Runtime mode:

```txt
1. Start the server.
2. Serve the Next.js app.
3. Open Chromium in kiosk mode to /stage.
4. Allow phones to connect over local Wi-Fi.
```

Local network model:

```txt
Pi joins existing Wi-Fi
phones join same Wi-Fi
phones open http://pi-address:port/controller
stage opens http://localhost:port/stage
```

## Security And Safety

MVP protections:

```txt
validate WebSocket messages
cap message rate per user
cap max active users
cap max active visual objects
reject messages with huge payloads
sanitize user names if displayed
add a clear/reset button
add a panic key on the stage/admin page
```

Later protections:

```txt
admin-only patch controls
room code
controller permissions
stage lock
per-user mute/kick
saved trusted presets
```

## Acceptance Criteria

```txt
stage can run at 720p at stable interactive framerate
message rate limits prevent runaway controllers
visual object caps prevent memory growth
server ignores malformed messages
manual test checklist passes on development machine
Pi deployment path is documented and repeatable
```
