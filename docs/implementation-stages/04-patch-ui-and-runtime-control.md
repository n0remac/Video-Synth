# Stage 4: Patch UI And Runtime Control

## Goal

Add the admin-facing `/patch` route and live runtime controls once the patch model and multiple modules exist.

## Patch/Admin User

An admin opens:

```txt
/patch
```

This page allows selecting presets, adjusting simple mappings, and broadcasting patch changes to the stage.

## Patch UI Scope

Build:

```txt
/patch page
PatchView
ModuleCard
ParameterControl
preset selector
slider controls
patch changed messages
```

Do not start with a full node graph editor. Start with preset selection and parameter controls.

## Patch UI Components

```txt
src/features/patch/PatchView.tsx
src/features/patch/patchEditorTypes.ts
src/features/patch/components/ModuleCard.tsx
src/features/patch/components/PatchCable.tsx
src/features/patch/components/ParameterControl.tsx
```

`PatchCable` can exist as a future-facing component, but the first usable interface can be a structured list of module controls.

## Runtime Control Messages

The patch route sends:

```ts
export type PatchChangedMessage = {
  type: "patch_changed"
  patchId: string
  patch: PatchDefinition
  timestamp: number
}
```

The stage should receive patch changes, update the active patch data, and route parameters to modules without recreating the entire runtime unless necessary.

## Editable Parameters

Start with controls that map directly to visible behavior:

```txt
ripple size
ripple lifetime
ripple opacity
noise amount
noise scale
feedback amount
feedback fade
```

## Presets

Initial presets can be hardcoded:

```txt
Ripple Paint
Collaborative Ripple Pool
Living Blob Painting
Particle Weather
Noise Projector
```

## Success Criteria

```txt
admin can switch between patches
admin can adjust feedback amount
admin can adjust ripple size/lifetime
patch changes affect the stage live
stage keeps animating while patch changes arrive
invalid patch messages are ignored safely
```

## Later Patch Editor Direction

After preset controls work, the patch UI can grow into a visual graph:

```txt
module cards expose typed outputs and inputs
patch cables connect compatible signal types
invalid connections are prevented
parameter controls show default and patched values
patches can be saved and loaded locally
```
