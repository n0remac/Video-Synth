# Signal Paint Project Guide

Signal Paint is a local-network collaborative visualizer built with Next.js,
React, TypeScript, Three.js, and a small Node/WebSocket relay. One browser runs a
fullscreen visual stage while phones or laptops on the same network send drawing,
color, and audio-control messages to it.

The repository name is `video-synth`, but the application identifies itself in
the UI and docs as Signal Paint.

## Runtime Shape

```txt
controllers / audio controllers / color controller
  -> WebSocket messages at /ws
  -> Node relay in server.mjs
  -> stage browser at /stage
  -> Three.js modules render the shared visual output
```

The stage owns the final render. Controllers do not render the shared visuals;
they send normalized input and settings over WebSocket.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the custom Next.js/WebSocket server on port `3000`. |
| `npm run build` | Build the production Next.js app. |
| `npm run start` | Start the production server with `server.mjs`. |
| `npm run typecheck` | Run TypeScript validation with `tsc --noEmit`. |
| `npm run test` | Run Node test files under `src/**/*.test.js`. |

## Top-Level Files

| Path | Description |
| --- | --- |
| `README.md` | User-facing setup, local-network usage, routes, and checks. |
| `Concept.md` | Product concept and staged implementation plan. |
| `docs/implementation-stages/` | Design notes for MVP, module architecture, later visual modules, patch UI, and hardening. Some described items are roadmap notes, not current code. |
| `server.mjs` | Custom HTTP server that boots Next.js and hosts the `/ws` WebSocket relay. |
| `public/worklets/audio-features-processor.js` | AudioWorklet processor used by the stage for low-latency FFT analysis and route-trigger detection. |
| `next.config.ts` | Next.js config with React strict mode enabled. |
| `tsconfig.json` | Strict TypeScript config with the `@/*` alias mapped to `src/*`. |

## Routes

| Route | Module Mounted | Purpose |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | Home page with links to the main tools. |
| `/stage` | `StageView` | Fullscreen Three.js visual stage. |
| `/controller` | `DrawControllerView` | Touch/pointer drawing controller for circles or line trails. |
| `/color-controller` | `ColorControllerView` | Color mapping controller for all users, the background, or a selected user. |
| `/audio-controller` | redirect page | Creates a random audio instance id and redirects to `/audio-controller/[instanceId]`. |
| `/audio-controller/[instanceId]` | `AudioControllerView` | Per-instance audio routing/settings controller. |
| `/shape-generator` | `ShapeGeneratorView` | Standalone 2D/3D shape generation tool. |
| `/ws` | `server.mjs` | WebSocket endpoint for stages and controllers. |

## Server Modules

### `server.mjs`

`server.mjs` is the active runtime server. It prepares the Next.js app, creates an
HTTP server, and attaches a `ws` WebSocket server at `/ws`.

Responsibilities:

- Assign client roles: `controller`, `color`, `audio`, or `stage`.
- Assign user ids and rotating user colors.
- Maintain connected-client state in memory.
- Validate incoming pointer, color, audio settings, audio frame, and clear-stage
  messages before rebroadcasting.
- Track audio circle settings by audio instance id.
- Broadcast stage audio frames to controllers and route audio settings updates to
  matching audio controllers plus all stages.

### `src/server/audioInstanceIds.mjs`

Normalizes audio instance ids for server-side JavaScript. Valid ids are non-empty
strings up to 80 characters containing letters, numbers, underscores, or hyphens.
Invalid values become `default`.

### `src/server/userRegistry.ts`

Small helper module for creating user ids and choosing assigned colors from the
shared Signal Paint palette. It is covered by the server test set but is not the
main source of runtime state in `server.mjs`.

### `src/server/roomState.ts`

Pure room-state helpers for adding users, removing users, and updating
`lastSeenAt`. This models room state immutably for tests and future server
extraction.

### `src/server/websocketServer.ts`

Currently a small typed placeholder that records the WebSocket runtime path
`/ws`. The actual WebSocket behavior is implemented inline in `server.mjs`.

## Network Module

### `src/features/network/protocolTypes.ts`

Defines the WebSocket message contract shared by the app:

- Pointer drawing messages.
- Color-control messages.
- Stage audio frames.
- Audio settings snapshots and updates.
- User join/leave/snapshot messages.
- Clear-stage and patch-changed messages.

### `src/features/network/protocol.ts`

Provides message constructors and `getVisualizerSocketUrl()`, which builds the
correct `ws:` or `wss:` URL for a role and optional audio instance id.

### `src/features/network/messageValidation.ts`

Parses and validates unknown WebSocket payloads into known protocol messages.
The client uses this when receiving server messages; `server.mjs` has parallel
validation logic for inbound server traffic.

## Stage Module

The stage is the visual output engine. It initializes Three.js, connects to the
WebSocket relay as role `stage`, receives controller messages, and drives visual
modules in an animation loop.

### `src/features/stage/StageView.tsx`

React view for `/stage`. It renders the fullscreen canvas, connection status, and
the stage audio start/stop button. It wires `useStageRuntime()` to
`useAudioAnalyser()`.

### `src/features/stage/useStageRuntime.ts`

The main stage runtime hook.

Responsibilities:

- Create renderer, scene, orthographic camera, and animation loop.
- Instantiate `ColorControlModule`, `RipplePaintModule`, and `TrailPaintModule`.
- Connect to `/ws?role=stage`.
- Convert normalized pointer messages into world coordinates.
- Route circle-mode pointer input to ripple paint.
- Route line-mode pointer input to trail paint.
- Apply color-control messages to draw colors and background color.
- Clear visual modules on `clear_stage`.
- Track audio route settings from audio controllers.
- Send stage audio analysis frames back over WebSocket.
- Convert audio trigger events into random-position ripple inputs.

### `src/features/stage/stageTypes.ts`

Defines the stage module lifecycle:

- `StageModule`: `id`, `update(dt)`, and `dispose()`.
- `InputReceivingModule<TInput>`: a stage module that also accepts
  `receiveInput(input)`.

### `src/features/stage/stageConfig.ts`

Central stage defaults: background color, target FPS, max ripples, and base world
dimensions.

### `src/features/stage/render/`

Renderer helpers:

- `createRenderer.ts`: creates the WebGL renderer and sizes it to the viewport.
- `createScene.ts`: creates a Three.js scene.
- `createCamera.ts`: creates and resizes the orthographic camera.
- `animationLoop.ts`: wraps `requestAnimationFrame` with delta-time calculation
  and a `stop()` handle.

### `src/features/stage/patches/`

Defines the current hardcoded patch model:

- `patchTypes.ts`: typed signal names, parameter names, patch connections, and
  patch definitions.
- `defaultPatch.ts`: the current ripple-paint patch mapping pointer position,
  pointer speed, and user color into ripple parameters.

There is no patch editor yet; this is a typed seed for the planned patch system.

## Stage Visual Modules

### Ripple Paint

Path: `src/features/stage/modules/ripplePaint/`

Ripple Paint renders expanding additive rings from pointer or audio-trigger
events.

Files:

- `RipplePaintModule.ts`: lifecycle adapter that owns ripple state and syncs it
  to Three.js meshes.
- `ripplePaintTypes.ts`: ripple, input, and state types.
- `ripplePaintLogic.ts`: pure functions for creating, aging, fading, capping,
  and removing ripples.
- `ripplePaintThree.ts`: Three.js ring mesh creation, mutation, and disposal.
- `index.ts`: public exports.

### Trail Paint

Path: `src/features/stage/modules/trailPaint/`

Trail Paint renders per-user flowing line trails from pointer paths.

Files:

- `TrailPaintModule.ts`: lifecycle adapter that owns trail state and syncs each
  user trail to one or more Three.js lines.
- `trailPaintTypes.ts`: trail point, trail, input, and state types.
- `trailPaintLogic.ts`: pure functions for clamping line count/length, adding
  points, aging trails, and trimming expired points.
- `trailPaintThree.ts`: Catmull-Rom curve sampling, bundled line offsets, color
  fade attributes, and Three.js line disposal.
- `index.ts`: public exports.

### Color Control

Path: `src/features/stage/modules/colorControl/`

Color Control applies short-lived color overrides from the color controller.
Overrides can target the stage background, all drawing users, or a selected user.
Global draw overrides intentionally do not apply to audio-role users.

Files:

- `ColorControlModule.ts`: stateful adapter used by the stage runtime.
- `colorControlTypes.ts`: HSV, input, override, and state types.
- `colorControlLogic.ts`: pure color conversion, mapping presets, override
  storage, expiration, and color resolution.
- `index.ts`: public exports.

## Controller Modules

### Shared Controller UI

Path: `src/features/controller/shared/`

Reusable controller pieces:

- `useVisualizerSocket.ts`: client WebSocket hook for controller, color, and audio
  roles. It tracks connection status, assigned user id/color, visible users,
  audio settings, and stage audio frames, and exposes typed send helpers.
- `ControllerNav.tsx`: controller navigation links.
- `TouchPad.tsx`: reusable pointer surface.
- `ControlSlider.tsx`: labeled slider control.
- `ColorPicker.tsx`: color input component.

### Draw Controller

Path: `src/features/controller/draw/`

The draw controller sends normalized pointer samples to the stage.

Files:

- `DrawControllerView.tsx`: UI for draw mode, color picker, intensity, line count,
  trail length, assigned color, and clear button.
- `usePointerController.ts`: pointer capture, normalization, velocity
  calculation, throttling to about 30 messages per second, and pointer-message
  creation.
- `controllerTypes.ts`: normalized pointer and velocity types.

### Color Controller

Path: `src/features/controller/color/`

The color controller sends color-control messages derived from a touch pad and
mapping preset.

`ColorControllerView.tsx` lets the user choose a base color, mapping preset,
target type, selected user, and amount. It sends repeated updates while the touch
pad is held so color overrides stay active on the stage.

### Audio Controller

Path: `src/features/controller/audio/`

The audio controller configures how the stage audio analysis should trigger
visual events for a specific audio instance id.

Files:

- `AudioControllerView.tsx`: UI for spectrum display, signal meters, trigger
  mode, trigger level, adaptive sensitivity/speed, gain, cooldown, frequency
  range, and circle color. It also renders canvas visualizations for the selected
  spectrum range and level motion.
- `audioRoutingLogic.ts`: pure logic for sampling a spectrum range, applying
  gain/threshold/inversion, smoothing values, adaptive trigger tracking, level
  motion tracking, and trigger-state transitions.
- `audioRoutingTypes.ts`: route and virtual-controller type definitions for
  future or extended routing behavior.

## Audio Analysis Module

Path: `src/features/audio/`

The audio module runs in the stage browser because the stage is the shared source
of audio frames for all controllers.

Files:

- `useAudioAnalyser.ts`: starts/stops microphone capture, prefers
  `AudioWorkletNode`, falls back to `AnalyserNode`, emits analysis frames, and
  invokes route trigger callbacks.
- `audioAnalyserLogic.ts`: pure helpers for dominant-bin detection, spectrum
  bucketing, band averages, and analysis-frame construction.
- `audioAnalyserTypes.ts`: analyser status and frame exports.

The worklet in `public/worklets/audio-features-processor.js` performs FFT
analysis at 60 Hz, smooths spectrum buckets, evaluates per-audio-instance routes,
and posts both analysis frames and trigger events back to `useAudioAnalyser()`.

## Shape Generator Module

Path: `src/features/shapeGenerator/`

`ShapeGeneratorView.tsx` is a standalone visual tool mounted at
`/shape-generator`. It creates and disposes Three.js geometry in response to UI
controls.

Capabilities:

- 2D polygon generation with side count, size, rotation, angle bias, and side
  variation.
- 3D prism, pyramid, sphere, and polyhedron generation.
- 3D depth, bevel, twist, taper, segment, and variation controls depending on
  selected shape family.
- Lit Three.js scene with mesh plus edge or wire overlays.

This module is currently independent from the WebSocket stage runtime.

## Shared Math Module

Path: `src/shared/math/`

Small pure helpers used across feature modules:

- `clamp.ts`: clamp a number to a min/max range.
- `lerp.ts`: linear interpolation.
- `vector.ts`: 2D vector type, magnitude, and normalization.

## Styling

`src/app/globals.css` contains global styles for the home page, stage overlays,
shape generator, controller screens, touch pads, sliders, audio panels, and
responsive layout behavior. The app uses a dark high-contrast visual style with
bright accent colors that match the assigned user palette.

## Tests

The repository uses Node's built-in test runner through `npm run test`.

Current tested areas include:

- Network protocol construction and message validation.
- Audio analyser logic.
- Audio routing logic.
- Server audio instance id normalization.
- Stage ripple, trail, and color-control logic.

The tests focus on pure logic and protocol behavior; browser rendering and live
WebSocket flows are not covered by automated integration tests yet.

## Current Architecture Notes

- The codebase follows a clear split between pure logic files and side-effect
  adapters. For example, visual modules separate `*Logic.ts`, `*Types.ts`,
  `*Three.ts`, and `*Module.ts`.
- `server.mjs` currently duplicates some validation and state that also exists in
  TypeScript helper modules. That keeps the active server simple but leaves an
  obvious future extraction path.
- The patch system is typed but not interactive. `defaultPatch.ts` documents the
  intended signal-to-parameter model for the current ripple effect.
- Audio controller settings are held in memory by audio instance id. They are not
  persisted across server restarts.
- The app is designed for trusted local-network use rather than authenticated
  public deployment.
