import { NextResponse } from "next/server"
import { createSongFromUpload, listSongs } from "@/features/songs/songStorage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ songs: await listSongs() })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio file." }, { status: 400 })
    }

    const song = await createSongFromUpload(file)

    return NextResponse.json({ song }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save uploaded song.",
      },
      { status: 400 },
    )
  }
}
