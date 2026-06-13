"use client"

import type { PointerEvent } from "react"

type TouchPadProps = {
  pointerDown: boolean
  handlers: {
    onPointerDown(event: PointerEvent<HTMLElement>): void
    onPointerMove(event: PointerEvent<HTMLElement>): void
    onPointerUp(event: PointerEvent<HTMLElement>): void
    onPointerCancel(event: PointerEvent<HTMLElement>): void
  }
}

export function TouchPad({ pointerDown, handlers }: TouchPadProps) {
  return (
    <section
      className="touch-pad"
      data-active={pointerDown}
      aria-label="Touch pad"
      {...handlers}
    >
      <div className="touch-pad-target" />
    </section>
  )
}
