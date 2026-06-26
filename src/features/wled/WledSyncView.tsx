"use client"

import { useEffect, useState } from "react"
import { ControlSlider } from "@/features/controller/shared/ControlSlider"
import { ControllerNav } from "@/features/controller/shared/ControllerNav"
import { useVisualizerSocket } from "@/features/controller/shared/useVisualizerSocket"
import type { WledSyncConfig } from "@/features/network/protocolTypes"

const defaultConfig: WledSyncConfig = {
  mode: "multicast",
  unicastAddress: "192.168.1.123",
  port: 11988,
  gain: 1,
  noiseFloor: 0.02,
  peakThreshold: 0.7,
}

function isValidIpv4Address(value: string) {
  const parts = value.split(".")

  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^(0|[1-9][0-9]{0,2})$/.test(part) &&
        Number.parseInt(part, 10) <= 255,
    )
  )
}

function formatTimestamp(value: number | null | undefined) {
  return value ? new Date(value).toLocaleTimeString() : "never"
}

export function WledSyncView() {
  const socket = useVisualizerSocket("wled")
  const snapshot = socket.wledSync
  const [draft, setDraft] = useState<WledSyncConfig>(defaultConfig)
  const [dirty, setDirty] = useState(false)
  const validAddress =
    draft.mode === "multicast" || isValidIpv4Address(draft.unicastAddress)
  const canSubmit = socket.connected && validAddress

  useEffect(() => {
    if (snapshot && !dirty) {
      setDraft(snapshot.config)
    }
  }, [dirty, snapshot])

  function updateDraft(patch: Partial<WledSyncConfig>) {
    setDraft((current) => ({ ...current, ...patch }))
    setDirty(true)
  }

  function sendUpdate(enabled: boolean) {
    if (!canSubmit) {
      return
    }

    socket.sendWledSyncUpdate({
      type: "wled_sync_update",
      config: draft,
      enabled,
      timestamp: Date.now(),
    })
    setDirty(false)
  }

  return (
    <main className="controller-shell wled-shell">
      <header className="controller-header">
        <div>
          <p className="eyebrow">Signal Paint</p>
          <h1>WLED Sync</h1>
        </div>
        <div className="connection-pill" data-status={socket.status}>
          {socket.status}
        </div>
      </header>

      <ControllerNav />

      <section className="wled-status-grid" aria-label="WLED sync status">
        <div>
          <span>Output</span>
          <strong>{snapshot?.enabled ? "enabled" : "disabled"}</strong>
        </div>
        <div>
          <span>Sending</span>
          <strong>{snapshot?.sending ? "active" : "idle"}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{snapshot?.activeSource ?? "none"}</strong>
        </div>
        <div>
          <span>Packets</span>
          <strong>{snapshot?.packetCount ?? 0}</strong>
        </div>
        <div>
          <span>Last send</span>
          <strong>{formatTimestamp(snapshot?.lastSendAt)}</strong>
        </div>
      </section>

      <section className="wled-panel">
        <header>
          <div>
            <p className="eyebrow">Destination</p>
            <h2>Audio-sync output</h2>
          </div>
          <div className="wled-actions">
            <button
              type="button"
              className="wled-secondary-button"
              disabled={!canSubmit || !dirty}
              onClick={() => sendUpdate(snapshot?.enabled ?? false)}
            >
              Save
            </button>
            <button
              type="button"
              className="wled-enable-button"
              data-active={snapshot?.enabled ?? false}
              disabled={!canSubmit}
              onClick={() => sendUpdate(!(snapshot?.enabled ?? false))}
            >
              {snapshot?.enabled ? "Disable sync" : "Enable sync"}
            </button>
          </div>
        </header>

        <div className="wled-config-grid">
          <div className="mode-toggle" aria-label="WLED destination mode">
            <button
              type="button"
              data-active={draft.mode === "multicast"}
              onClick={() => updateDraft({ mode: "multicast" })}
            >
              Multicast
            </button>
            <button
              type="button"
              data-active={draft.mode === "unicast"}
              onClick={() => updateDraft({ mode: "unicast" })}
            >
              Unicast
            </button>
          </div>

          <label className="control-field">
            <span>
              Device IPv4
              <strong>{draft.mode === "multicast" ? "fallback" : "target"}</strong>
            </span>
            <input
              className="wled-text-input"
              type="text"
              inputMode="decimal"
              value={draft.unicastAddress}
              aria-invalid={!validAddress}
              onChange={(event) =>
                updateDraft({ unicastAddress: event.target.value.trim() })
              }
            />
          </label>

          <label className="control-field">
            <span>
              UDP Port <strong>{draft.port}</strong>
            </span>
            <input
              className="wled-text-input"
              type="number"
              min={1}
              max={65535}
              value={draft.port}
              onChange={(event) =>
                updateDraft({
                  port: Math.min(
                    65535,
                    Math.max(1, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>

          <ControlSlider
            label="Output Gain"
            min={0.1}
            max={6}
            step={0.1}
            value={draft.gain}
            onValueChange={(gain) => updateDraft({ gain })}
          />
          <ControlSlider
            label="Noise Floor"
            min={0}
            max={0.5}
            step={0.01}
            value={draft.noiseFloor}
            onValueChange={(noiseFloor) => updateDraft({ noiseFloor })}
          />
          <ControlSlider
            label="Peak Threshold"
            min={0}
            max={1}
            step={0.01}
            value={draft.peakThreshold}
            onValueChange={(peakThreshold) => updateDraft({ peakThreshold })}
          />
        </div>

        <div className="wled-test-row">
          <button
            type="button"
            className="wled-secondary-button"
            disabled={!socket.connected || !snapshot?.enabled}
            onClick={() =>
              socket.sendWledSyncTest({
                type: "wled_sync_test",
                timestamp: Date.now(),
              })
            }
          >
            Run 5-second bass test
          </button>
          <p>
            UDP has no receiver acknowledgement. “Sending” confirms local packet
            output, not that the strip received it.
          </p>
        </div>

        {!validAddress ? (
          <p className="audio-error">Enter a valid IPv4 address.</p>
        ) : null}
        {snapshot?.lastError ? (
          <p className="audio-error">{snapshot.lastError}</p>
        ) : null}
      </section>

      <section className="wled-panel wled-setup-panel">
        <div>
          <p className="eyebrow">Receiver setup</p>
          <h2>WLED configuration</h2>
        </div>
        <ol>
          <li>Open Config → Usermods → AudioReactive on the WLED device.</li>
          <li>Enable AudioReactive and set Audio Sync to Receive.</li>
          <li>Set the receive port to {draft.port} and save.</li>
          <li>Select an audio-reactive effect such as Gravimeter or GEQ.</li>
          <li>Restart the WLED controller if receive-mode changes do not apply.</li>
        </ol>
      </section>
    </main>
  )
}
