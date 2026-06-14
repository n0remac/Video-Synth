export const DEFAULT_AUDIO_INSTANCE_ID = "default"

const audioInstanceIdPattern = /^[A-Za-z0-9_-]+$/

export function normalizeAudioInstanceId(value) {
  if (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    audioInstanceIdPattern.test(value)
  ) {
    return value
  }

  return DEFAULT_AUDIO_INSTANCE_ID
}
