import { NextResponse } from "next/server"
import { deleteSong } from "@/features/songs/songStorage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SongRouteContext = {
  params: Promise<{ songId: string }>
}

export async function DELETE(_request: Request, { params }: SongRouteContext) {
  try {
    const { songId } = await params

    await deleteSong(songId)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Song not found." }, { status: 404 })
  }
}
