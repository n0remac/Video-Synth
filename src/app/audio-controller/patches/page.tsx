import { AudioPatchLibraryView } from "@/features/controller/audio/AudioPatchLibraryView"

type AudioControllerPatchesPageProps = {
  searchParams: Promise<{ target?: string | string[] }>
}

export default async function AudioControllerPatchesPage({
  searchParams,
}: AudioControllerPatchesPageProps) {
  const { target } = await searchParams
  const initialTarget = Array.isArray(target) ? target[0] : target

  return <AudioPatchLibraryView initialTarget={initialTarget} />
}
