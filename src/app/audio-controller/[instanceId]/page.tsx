import { AudioControllerView } from "@/features/controller/audio/AudioControllerView"

type AudioControllerInstancePageProps = {
  params: Promise<{
    instanceId: string
  }>
}

export default async function AudioControllerInstancePage({
  params,
}: AudioControllerInstancePageProps) {
  const { instanceId } = await params

  return <AudioControllerView audioInstanceId={instanceId} />
}
