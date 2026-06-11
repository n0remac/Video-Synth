"use client"

type ColorPickerProps = {
  color: string
  onColorChange(color: string): void
}

export function ColorPicker({ color, onColorChange }: ColorPickerProps) {
  return (
    <label className="control-field">
      <span>Color</span>
      <input
        type="color"
        value={color}
        onChange={(event) => onColorChange(event.target.value)}
      />
    </label>
  )
}
