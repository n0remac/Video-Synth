# Signal Paint Project Guide

Signal Paint is a local-network collaborative visualizer built with Next.js,
React, TypeScript, Three.js, and a small Node/WebSocket relay. One browser runs a
fullscreen visual stage while phones or laptops on the same network send drawing,
color, and audio-control messages to it.

The repository name is `video-synth`, but the application identifies itself in
the UI and docs as Signal Paint.

## Runtime Shape

```txt
controllers / audio controllers / color controller / songs page
  -> WebSocket messages at /ws
  -> Node relay in server.mjs
  -> stage browser at /stage
  -> Three.js modules render the shared visual output
```

The stage owns the final render. Controllers do not render the shared visuals;
they send normalized input, settings, and transport commands over WebSocket.
Uploaded songs are saved locally, scanned in the browser, and played by the stage
so visuals and audio share the stage tab's playback clock.

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
| `/audio-controller/[instanceId]` | `AudioControllerView` | Per-instance audio routing/settings controller with a selector for remembered audio instances. |
| `/songs` | `SongsView` | Song library, upload/scanning workflow, and stage playback controls. |
| `/shape-generator` | `ShapeGeneratorView` | Standalone 2D/3D shape generation tool. |
| `/api/songs` | route handlers | Lists and uploads local song files. |
| `/api/songs/[songId]` | route handlers | Deletes a saved song. |
| `/api/songs/[songId]/audio` | route handlers | Streams saved song audio with byte-range support for seeking. |
| `/api/songs/[songId]/analysis` | route handlers | Reads and writes precomputed song analysis JSON. |
| `/wled` | `WledSyncView` | WLED audio-sync destination, tuning, test signal, and output status. |
| `/ws` | `server.mjs` | WebSocket endpoint for stages and controllers. |

## Server Modules

### `server.mjs`

`server.mjs` is the active runtime server. It prepares the Next.js app, creates an
HTTP server, and attaches a `ws` WebSocket server at `/ws`.

Responsibilities:

- Assign client roles: `controller`, `color`, `audio`, `stage`, `songs`, or
  `wled`.
- Assign user ids and rotating user colors.
- Maintain connected-client state in memory.
- Validate incoming pointer, color, audio settings, song transport, audio frame,
  and clear-stage messages before rebroadcasting.
- Track audio circle settings by audio instance id.
- Broadcast remembered audio instance lists to audio controllers and delete audio
  instance settings on request.
- Broadcast stage audio frames to controllers and route audio settings updates to
  matching audio controllers plus all stages.
- Route song load/play/pause/seek/stop commands from the songs page to stages and
  song transport updates from stages back to songs pages.
- Convert stage audio frames into WLED V2 audio-sync UDP packets and send them by
  multicast or direct unicast.

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
- Audio instance snapshots and delete messages.
- Song transport commands and updates.
- User join/leave/snapshot messages.
- Clear-stage and patch-changed messages.
- WLED sync configuration, test, and status messages.

## WLED Sync

`src/server/wledSync.mjs` owns the Node-only UDP socket, WLED V2 packet packing,
signal conditioning, source selection, stale-audio clearing, synthetic test
signal, and persisted destination settings. Browser audio and song analysis add
an optional 16-band `wledAudio` payload to normal stage audio frames; the browser
never sends UDP directly.

The `/wled` operator page connects with the `wled` WebSocket role. It can switch
between standard multicast `239.0.0.1:11988` and an explicit device IPv4
address. Configuration persists in `data/wled/config.json`; enabled state does
not persist across server restarts.

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

React view for `/stage`. It renders the fullscreen canvas, connection status, the
stage live audio input selector/start/stop controls, and compact song transport
status. It wires `useStageRuntime()` to `useAudioAnalyser()` and stops song
playback before starting live input analysis.

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
- Load analyzed songs, own `HTMLAudioElement` playback, use
  `audio.currentTime` as the song clock, and emit normal audio frames with
  `source: "song"`.
- Apply audio routes to song `controlSpectrum` frames and clear route state when
  songs are loaded, stopped, seeked, or when an audio controller is deleted.
- Broadcast song transport state to songs pages.

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
  audio settings, remembered audio instances, stage audio frames, and song
  transport updates, and exposes typed send helpers.
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
visual events for a specific audio instance id. Audio instance settings are held
in server memory so closed controller tabs can be restored from the instance
selector while the server is running.

Files:

- `AudioControllerView.tsx`: UI for selecting remembered audio instances,
  deleting audio instances, spectrum display, signal meters, trigger mode,
  trigger level, adaptive sensitivity/speed, gain, cooldown, frequency range,
  and circle color. It also renders canvas visualizations for the selected
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

- `useAudioAnalyser.ts`: starts/stops selected live audio input capture, prefers
  `AudioWorkletNode`, falls back to `AnalyserNode`, emits analysis frames, and
  invokes route trigger callbacks.
- `useAudioInputDevices.ts`: enumerates browser audio input devices, tracks the
  selected live input, refreshes on device changes, and persists the selection.
- `audioInputDevices.ts`: pure helpers for normalizing audio input device
  options and resolving saved selections.
- `audioAnalyserLogic.ts`: pure helpers for dominant-bin detection, spectrum
  bucketing, band averages, and analysis-frame construction.
- `audioAnalyserTypes.ts`: analyser status and frame exports.

The worklet in `public/worklets/audio-features-processor.js` performs FFT
analysis at 60 Hz, smooths spectrum buckets, evaluates per-audio-instance routes,
and posts both analysis frames and trigger events back to `useAudioAnalyser()`.

## Songs Module

Path: `src/features/songs/`

The songs feature lets users upload local audio files, scan full-song spectrum
analysis, and remotely control stage-owned song playback. The songs page is a
library/control surface; it does not drive visual timing directly.

Runtime flow:

```txt
/songs upload
  -> /api/songs saves file under data/songs/{songId}
  -> browser decodes audio and scans FFT frames in a Web Worker
  -> /api/songs/[songId]/analysis stores analysis.json
  -> /songs sends song_command over WebSocket
  -> /stage loads audio + analysis and emits AudioAnalysisFrame source "song"
```

Files:

- `SongsView.tsx`: orchestration for loading songs, uploading, scanning, and
  sending song transport commands.
- `SongLibraryPanel.tsx`: reusable upload/list/selection panel.
- `SelectedSongPlayer.tsx`: reusable selected-song detail, scan, transport, and
  seek panel.
- `songStorage.ts`: Node route-handler storage adapter for `data/songs`.
- `songAnalysisLogic.ts`: shared FFT scanning, analysis-frame creation, and
  lookahead helpers such as frame-at-time, windowed frames, peak-ahead, and
  average-spectrum-ahead.
- `songAnalysisWorker.ts`: browser worker that runs the FFT scan off the main UI
  thread.
- `songValidation.ts`, `songTypes.ts`, and `songFormatters.ts`: schema checks,
  shared contracts, and display helpers.

Song analysis JSON is versioned and includes display `spectrum` plus less-smoothed
`controlSpectrum` for routing and future lookahead-aware visuals. The v1 scanner
supports normal browser-decodable audio files and enforces the current upload and
duration limits in code.

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
shape generator, controller screens, song library/player panels, touch pads,
sliders, audio panels, and responsive layout behavior. The app uses a dark
high-contrast visual style with bright accent colors that match the assigned user
palette.

## Tests

The repository uses Node's built-in test runner through `npm run test`.

Current tested areas include:

- Network protocol construction and message validation.
- Audio analyser logic.
- Audio routing logic.
- Song analysis and validation logic.
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
- Audio controller settings are held in memory by audio instance id. They can be
  restored from the audio-controller selector while the server is running, but
  they are not persisted across server restarts.
- Songs are stored locally under `data/songs/`, which is intentionally ignored by
  git. Song analysis is stored as debuggable JSON rather than a compact binary
  format.
- The app is designed for trusted local-network use rather than authenticated
  public deployment.
