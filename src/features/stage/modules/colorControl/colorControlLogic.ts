import type {
  ColorControlInput,
  ColorControlState,
  HsvColor,
} from "./colorControlTypes"

export const emptyColorControlState: ColorControlState = {
  globalDrawColor: null,
  backgroundColor: null,
  userDrawColors: {},
}

export const colorControlActiveTimeoutMs = 500

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toHexChannel(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
}

export function hexToRgb(hex: string) {
  const normalized = hex.trim().replace("#", "")
  const fallback = { r: 255, g: 255, b: 255 }

  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return fallback
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

export function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${toHexChannel(rgb.r)}${toHexChannel(rgb.g)}${toHexChannel(rgb.b)}`
}

export function rgbToHsv(rgb: { r: number; g: number; b: number }): HsvColor {
  const r = clamp(rgb.r / 255, 0, 1)
  const g = clamp(rgb.g / 255, 0, 1)
  const b = clamp(rgb.b / 255, 0, 1)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0

  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6
    } else if (max === g) {
      h = (b - r) / delta + 2
    } else {
      h = (r - g) / delta + 4
    }
  }

  return {
    h: ((h * 60 + 360) % 360) / 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

export function hsvToRgb(hsv: HsvColor) {
  const h = ((hsv.h % 1) + 1) % 1
  const s = clamp(hsv.s, 0, 1)
  const v = clamp(hsv.v, 0, 1)
  const sector = h * 6
  const chroma = v * s
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const m = v - chroma
  let r = 0
  let g = 0
  let b = 0

  if (sector < 1) {
    r = chroma
    g = x
  } else if (sector < 2) {
    r = x
    g = chroma
  } else if (sector < 3) {
    g = chroma
    b = x
  } else if (sector < 4) {
    g = x
    b = chroma
  } else if (sector < 5) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  }
}

function applyContrast(rgb: { r: number; g: number; b: number }, value: number) {
  const contrast = 0.5 + value

  return {
    r: (rgb.r - 128) * contrast + 128,
    g: (rgb.g - 128) * contrast + 128,
    b: (rgb.b - 128) * contrast + 128,
  }
}

export function applyColorControl(input: ColorControlInput): string {
  const x = clamp(input.x, 0, 1)
  const y = clamp(input.y, 0, 1)
  const amount = clamp(input.amount, 0, 1)
  const baseRgb = hexToRgb(input.baseColor)
  const hsv = rgbToHsv(baseRgb)
  let contrast: number | null = null

  if (input.mapping === "hue-brightness") {
    hsv.h = x
    hsv.v = hsv.v * (1 - amount) + (1 - y) * amount
  }

  if (input.mapping === "saturation-brightness") {
    hsv.s = hsv.s * (1 - amount) + x * amount
    hsv.v = hsv.v * (1 - amount) + (1 - y) * amount
  }

  if (input.mapping === "hue-saturation") {
    hsv.h = x
    hsv.s = hsv.s * (1 - amount) + (1 - y) * amount
  }

  if (input.mapping === "saturation-contrast") {
    hsv.s = hsv.s * (1 - amount) + x * amount
    contrast = y
  }

  const rgb = hsvToRgb(hsv)
  return rgbToHex(contrast === null ? rgb : applyContrast(rgb, contrast))
}

export function receiveColorControl(
  state: ColorControlState,
  input: ColorControlInput,
): ColorControlState {
  const override = {
    ...input,
    color: applyColorControl(input),
  }

  if (input.target === "background") {
    return {
      ...state,
      backgroundColor: override,
    }
  }

  if (input.target === "all") {
    return {
      ...state,
      globalDrawColor: override,
    }
  }

  if (!input.targetUserId) {
    return state
  }

  return {
    ...state,
    userDrawColors: {
      ...state.userDrawColors,
      [input.targetUserId]: override,
    },
  }
}

function isOverrideActive(
  override: { timestamp: number } | null,
  now: number,
  activeTimeoutMs: number,
) {
  return override !== null && now - override.timestamp <= activeTimeoutMs
}

export function pruneExpiredColorControls(
  state: ColorControlState,
  now: number,
  activeTimeoutMs = colorControlActiveTimeoutMs,
): ColorControlState {
  const userDrawColors = Object.fromEntries(
    Object.entries(state.userDrawColors).filter(([, override]) =>
      isOverrideActive(override, now, activeTimeoutMs),
    ),
  )

  return {
    globalDrawColor: isOverrideActive(state.globalDrawColor, now, activeTimeoutMs)
      ? state.globalDrawColor
      : null,
    backgroundColor: isOverrideActive(state.backgroundColor, now, activeTimeoutMs)
      ? state.backgroundColor
      : null,
    userDrawColors,
  }
}

export function resolveDrawColor(
  state: ColorControlState,
  userId: string,
  fallbackColor: string,
  userRole = "controller",
) {
  const userOverride = state.userDrawColors[userId] ?? null
  const globalOverride = userRole === "audio" ? null : state.globalDrawColor

  if (userOverride && globalOverride) {
    return userOverride.timestamp >= globalOverride.timestamp
      ? userOverride.color
      : globalOverride.color
  }

  return userOverride?.color ?? globalOverride?.color ?? fallbackColor
}

export function resolveBackgroundColor(
  state: ColorControlState,
  fallbackColor: string,
) {
  return state.backgroundColor?.color ?? fallbackColor
}
