export function formatDuration(durationMs?: number) {
  if (!durationMs) {
    return "--:--"
  }

  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function formatTransportTime(timeMs: number, durationMs: number) {
  return `${formatDuration(timeMs)} / ${formatDuration(durationMs)}`
}
