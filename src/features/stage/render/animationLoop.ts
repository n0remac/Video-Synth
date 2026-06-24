export type AnimationLoopHandle = {
  stop(): void
}

export function startAnimationLoop(onFrame: (dt: number) => void) {
  let running = true
  let previousTime = performance.now()
  let frameId: number | ReturnType<typeof setTimeout> = 0
  const requestFrame =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) =>
          setTimeout(() => callback(performance.now()), 1000 / 60)
  const cancelFrame =
    typeof cancelAnimationFrame === "function"
      ? cancelAnimationFrame
      : clearTimeout

  function frame(time: number) {
    if (!running) {
      return
    }

    const dt = Math.min((time - previousTime) / 1000, 0.05)
    previousTime = time
    onFrame(dt)
    frameId = requestFrame(frame)
  }

  frameId = requestFrame(frame)

  return {
    stop() {
      running = false
      cancelFrame(frameId as number)
    },
  } satisfies AnimationLoopHandle
}
