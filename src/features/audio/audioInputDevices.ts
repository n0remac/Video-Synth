export const systemAudioInputDeviceId = ""

export const liveAudioInputDeviceStorageKey =
  "signal-paint-live-audio-input-device-id"

export type AudioInputDeviceLike = Pick<
  MediaDeviceInfo,
  "deviceId" | "kind" | "label"
>

export type AudioInputDeviceOption = {
  deviceId: string
  label: string
  systemDefault: boolean
}

export function getAudioInputDeviceOptions(
  devices: readonly AudioInputDeviceLike[],
): AudioInputDeviceOption[] {
  const options: AudioInputDeviceOption[] = [
    {
      deviceId: systemAudioInputDeviceId,
      label: "System default",
      systemDefault: true,
    },
  ]
  const seenDeviceIds = new Set([systemAudioInputDeviceId])
  let fallbackLabelIndex = 1

  devices.forEach((device) => {
    if (device.kind !== "audioinput" || seenDeviceIds.has(device.deviceId)) {
      return
    }

    seenDeviceIds.add(device.deviceId)

    const label = device.label.trim()

    options.push({
      deviceId: device.deviceId,
      label: label.length > 0 ? label : `Audio input ${fallbackLabelIndex}`,
      systemDefault: false,
    })
    fallbackLabelIndex += 1
  })

  return options
}

export function resolveSelectedAudioInputDeviceId(
  options: readonly AudioInputDeviceOption[],
  preferredDeviceId: string | null | undefined,
) {
  if (!preferredDeviceId) {
    return systemAudioInputDeviceId
  }

  return options.some((option) => option.deviceId === preferredDeviceId)
    ? preferredDeviceId
    : systemAudioInputDeviceId
}
