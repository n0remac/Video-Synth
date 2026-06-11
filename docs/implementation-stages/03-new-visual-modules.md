# Stage 3: New Visual Modules

## Goal

Introduce new modules after the MVP patch is stable and the module architecture is in place. Each new module should follow the file pattern from Stage 2 and keep pure logic separate from rendering side effects.

## Module Categories

### Input Modules

These produce control signals.

| Module | Outputs |
| --- | --- |
| Pointer | position, velocity, speed, down |
| User color | color |
| Slider | value |
| Time | elapsed, delta |
| Noise | value, field |
| Audio input | volume, frequency bands |
| Device tilt | x tilt, y tilt, rotation |

### Generator Modules

These create visible objects or textures.

| Module | Output |
| --- | --- |
| Ripple Paint | circles/rings |
| Shape Maker | circles, polygons, lines, blobs |
| Particle Emitter | particles |
| Gradient Field | color field |
| Noise Field | procedural texture |
| Text/Glyph | symbols, labels, characters |
| Grid | reactive cells |

### Modifier Modules

These change existing visuals.

| Module | Effect |
| --- | --- |
| Feedback | repeats previous frames |
| Blur | softens visuals |
| Color Remap | maps values to palette colors |
| Displacement | warps image positions |
| Mask | reveals/hides one image using another |
| Pixelate | lowers resolution |
| Kaleidoscope | mirrors/rotates image |
| Echo | repeats past positions |

## First Module Roadmap

Add modules in this order.

### 1. Color Palette

Purpose:

> Provide reusable color logic.

Initial abilities:

```txt
fixed palette
user color
hue cycling
speed-to-brightness mapping
```

Patch outputs:

```txt
palette.color
palette.gradient
palette.valueToColor
```

### 2. Noise Field

Purpose:

> Provide organic motion and texture.

Initial abilities:

```txt
random value
smooth noise value
noise at x/y/time
noise-based drift
```

Patch outputs:

```txt
noise.value
noise.field
noise.vector
```

### 3. Shape Maker

Purpose:

> Generalize from ripples into reusable shape generation.

Initial shapes:

```txt
circle
ring
rectangle
triangle
polygon
line
blob
```

### 4. Particle Emitter

Purpose:

> Emit particles from touch points.

Inputs:

```txt
position
velocity
color
lifetime
size
gravity
noiseField
```

### 5. Feedback Pass

Purpose:

> Apply visual persistence and recursive frame effects.

Modes:

```txt
fade
zoom
rotate
blur
color shift
```

### 6. Displacement Pass

Purpose:

> Let noise, shapes, or feedback warp other visuals.

Inputs:

```txt
image
field
amount
scale
```

### 7. Mask Module

Purpose:

> Let one visual reveal another.

Examples:

```txt
shape mask reveals noise
text mask reveals feedback
user blobs reveal gradient
```

## Stage 3 Milestones

### Add Noise Modulation

Goal:

> Noise can modulate ripple behavior.

Build:

```txt
noiseField module
pure noise value function
noise amount parameter
optional wobble/drift
```

Success criteria:

```txt
ripples can wobble or drift
noise parameters can be adjusted
noise remains separate from RipplePaint logic
```

### Add Basic Feedback

Goal:

> Visuals leave stronger trails or frame feedback.

First version:

```txt
longer object lifetime
slow fade
larger opacity trail
```

Later version:

```txt
render target feedback
previous frame texture
fade/scale/rotate feedback pass
```

Success criteria:

```txt
visuals feel persistent
feedback can be controlled by a slider
feedback is implemented as its own module or pass
```

## Example Future Patches

Collaborative ripple pool:

```txt
pointer.position -> ripple.position
user.color       -> ripple.color
pointer.speed    -> ripple.radius
noise.field      -> ripple.wobble
slider.value     -> feedback.amount
```

Living blob painting:

```txt
pointer.position -> blob.center
noise.value      -> blob.edgeWobble
palette.color    -> blob.fill
feedback.image   -> blob.texture
```

Particle weather:

```txt
pointer.position -> particle.emitterPosition
pointer.velocity -> particle.initialVelocity
user.color       -> particle.color
noise.vector     -> particle.force
slider.value     -> particle.lifetime
```

User constellation:

```txt
user.positions   -> constellation.nodes
user.distance    -> constellation.lineOpacity
user.color       -> constellation.nodeColor
noise.value      -> constellation.lineWobble
```

Noise projector:

```txt
noise.field      -> colorPalette.lookup
shape.mask       -> noise.visibility
feedback.image   -> displacement.source
slider.value     -> noise.scale
```

## Acceptance Criteria

```txt
each new module follows the Stage 2 module pattern
module-specific helpers stay feature-local
shared helpers are only lifted when reused
new patch connections are represented as typed data
new modules can be disabled without breaking Ripple Paint
```
