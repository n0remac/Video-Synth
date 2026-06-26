import { NextResponse } from "next/server"
import { deleteAudioPatch } from "@/features/controller/audio/audioPatchStorage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AudioPatchRouteContext = {
  params: Promise<{ patchId: string }>
}

export async function DELETE(
  _request: Request,
  { params }: AudioPatchRouteContext,
) {
  try {
    const { patchId } = await params

    await deleteAudioPatch(patchId)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "Audio patch not found." },
      { status: 404 },
    )
  }
}
