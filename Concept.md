# Signal Paint Concept

Signal Paint is a collaborative modular visualizer. Multiple people connect from phones or computers through a local web app, send touch, pointer, color, and control signals, and generate shared visuals on a projected Three.js stage.

The implementation is split into staged markdown plans. The first stage is intentionally a small MVP patch. Later stages introduce new modules and grow the patching model.

## Implementation Stages

1. [Stage 1: MVP Patch](docs/implementation-stages/01-mvp-patch.md)
2. [Stage 2: Module Architecture](docs/implementation-stages/02-module-architecture.md)
3. [Stage 3: New Visual Modules](docs/implementation-stages/03-new-visual-modules.md)
4. [Stage 4: Patch UI And Runtime Control](docs/implementation-stages/04-patch-ui-and-runtime-control.md)
5. [Stage 5: Deployment, Safety, And Hardening](docs/implementation-stages/05-deployment-safety-and-hardening.md)

## Core Design Goal

The system should be built around small replaceable modules. Each module should keep its logic close to where it is used. Shared code should only be lifted upward when multiple nearby modules need it.

The architecture should favor functional programming:

```txt
input data
  -> pure transformations
  -> module state update
  -> rendering side effects
  -> visual output
```

Pure functions should stay separate from DOM events, WebSocket connections, Three.js object mutation, animation loops, browser APIs, and server state mutation.

## Primary Routes

```txt
/stage       projected Three.js output
/controller  participant controls
/patch       later admin and patch controls
```

For the MVP, `/patch` can be represented by a hardcoded default patch rather than a full editor.
