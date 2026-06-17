import { NextResponse } from "next/server"
import {
  readSongAnalysis,
  writeSongAnalysis,
} from "@/features/songs/songStorage"
import { isSongAnalysis } from "@/features/songs/songValidation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SongAnalysisRouteContext = {
  params: Promise<{ songId: string }>
}

export async function GET(
  _request: Request,
  { params }: SongAnalysisRouteContext,
) {
  try {
    const { songId } = await params
    const analysis = await readSongAnalysis(songId)

    return NextResponse.json(analysis)
  } catch {
    return NextResponse.json({ error: "Song analysis not found." }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: SongAnalysisRouteContext,
) {
  try {
    const { songId } = await params
    const analysis = await request.json()

    if (!isSongAnalysis(analysis) || analysis.songId !== songId) {
      return NextResponse.json({ error: "Invalid song analysis." }, { status: 400 })
    }

    const metadata = await writeSongAnalysis(songId, analysis)

    return NextResponse.json({ metadata })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save song analysis.",
      },
      { status: 400 },
    )
  }
}
