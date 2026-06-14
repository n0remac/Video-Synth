"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

function createAudioInstanceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export default function AudioControllerPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/audio-controller/${createAudioInstanceId()}`)
  }, [router])

  return (
    <main className="controller-shell audio-controller-shell">
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>Audio</h1>
        </div>
        <div className="connection-pill" data-status="connecting">
          creating
        </div>
      </header>
    </main>
  )
}
