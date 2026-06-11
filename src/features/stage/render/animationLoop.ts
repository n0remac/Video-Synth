export type AnimationLoopHandle = {
  stop(): void
}

export function startAnimationLoop(onFrame: (dt: number) => void) {
  let running = true
  let previousTime = performance.now()
  let frameId = 0

  function frame(time: number) {
    if (!running) {
      return
    }

    const dt = Math.min((time - previousTime) / 1000, 0.05)
    previousTime = time
    onFrame(dt)
    frameId = requestAnimationFrame(frame)
  }

  frameId = requestAnimationFrame(frame)

  return {
    stop() {
      running = false
      cancelAnimationFrame(frameId)
    },
  } satisfies AnimationLoopHandle
}
