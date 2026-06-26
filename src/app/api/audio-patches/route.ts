import { NextResponse } from "next/server"
import {
  createAudioPatch,
  listAudioPatches,
} from "@/features/controller/audio/audioPatchStorage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ patches: await listAudioPatches() })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const patch = await createAudioPatch({
      name: typeof body.name === "string" ? body.name : "",
      settings: body.settings,
    })

    return NextResponse.json({ patch }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save audio patch.",
      },
      { status: 400 },
    )
  }
}
