"use client"

type ControlSliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onValueChange(value: number): void
}

export function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
}: ControlSliderProps) {
  return (
    <label className="control-field">
      <span>
        {label} <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
      />
    </label>
  )
}
