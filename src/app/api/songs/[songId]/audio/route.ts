import { createReadStream } from "node:fs"
import { Readable } from "node:stream"
import { NextResponse } from "next/server"
import { getSongAudioFile } from "@/features/songs/songStorage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SongAudioRouteContext = {
  params: Promise<{ songId: string }>
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null
  }

  const [startPart, endPart] = rangeHeader.slice("bytes=".length).split("-")
  const start = startPart ? Number.parseInt(startPart, 10) : 0
  const end = endPart ? Number.parseInt(endPart, 10) : size - 1

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null
  }

  return { start, end: Math.min(end, size - 1) }
}

export async function GET(request: Request, { params }: SongAudioRouteContext) {
  try {
    const { songId } = await params
    const { filePath, fileStat, metadata } = await getSongAudioFile(songId)
    const fileSize = fileStat.size
    const range = parseRange(request.headers.get("range"), fileSize)

    if (range) {
      const stream = createReadStream(filePath, {
        start: range.start,
        end: range.end,
      })
      const body = Readable.toWeb(stream) as ReadableStream

      return new Response(body, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(range.end - range.start + 1),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
          "Content-Type": metadata.mimeType,
        },
      })
    }

    const stream = createReadStream(filePath)
    const body = Readable.toWeb(stream) as ReadableStream

    return new Response(body, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(fileSize),
        "Content-Type": metadata.mimeType,
      },
    })
  } catch {
    return NextResponse.json({ error: "Song audio not found." }, { status: 404 })
  }
}
