"use client"

import { useStageRuntime } from "./useStageRuntime"

export function StageView() {
  const { canvasRef, connectionStatus } = useStageRuntime()

  return (
    <main className="stage-shell">
      <canvas ref={canvasRef} className="stage-canvas" />
      <div className="stage-status" data-status={connectionStatus}>
        {connectionStatus}
      </div>
    </main>
  )
}
