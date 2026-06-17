import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  isAudioMimeType,
  isSongAnalysis,
  isSongId,
  isSongMetadata,
} from "./songValidation"
import {
  maxSongUploadBytes,
  type SongAnalysis,
  type SongMetadata,
  type SongSummary,
} from "./songTypes"

const songsRoot = path.join(process.cwd(), "data", "songs")
const metadataFileName = "metadata.json"
const analysisFileName = "analysis.json"

function createSongId() {
  return `song-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeTitle(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim()

  return baseName.length > 0 ? baseName.slice(0, 80) : "Untitled song"
}

function getExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()

  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : ".audio"
}

function getSongDirectory(songId: string) {
  if (!isSongId(songId)) {
    throw new Error("Invalid song id.")
  }

  return path.join(songsRoot, songId)
}

function getMetadataPath(songId: string) {
  return path.join(getSongDirectory(songId), metadataFileName)
}

export function getAnalysisPath(songId: string) {
  return path.join(getSongDirectory(songId), analysisFileName)
}

export async function ensureSongRoot() {
  await mkdir(songsRoot, { recursive: true })
}

export async function listSongs(): Promise<SongSummary[]> {
  await ensureSongRoot()
  const entries = await readdir(songsRoot, { withFileTypes: true })
  const songs: SongSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSongId(entry.name)) {
      continue
    }

    try {
      const metadata = await readSongMetadata(entry.name)
      const hasAnalysis = await stat(getAnalysisPath(entry.name))
        .then((value) => value.isFile())
        .catch(() => false)

      songs.push({ ...metadata, hasAnalysis })
    } catch {
      // Ignore incomplete song directories.
    }
  }

  return songs.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function readSongMetadata(songId: string): Promise<SongMetadata> {
  const metadata = JSON.parse(await readFile(getMetadataPath(songId), "utf8"))

  if (!isSongMetadata(metadata)) {
    throw new Error("Invalid song metadata.")
  }

  return metadata
}

export async function readSongAnalysis(songId: string): Promise<SongAnalysis> {
  const analysis = JSON.parse(await readFile(getAnalysisPath(songId), "utf8"))

  if (!isSongAnalysis(analysis) || analysis.songId !== songId) {
    throw new Error("Invalid song analysis.")
  }

  return analysis
}

export async function writeSongAnalysis(songId: string, analysis: SongAnalysis) {
  if (!isSongAnalysis(analysis) || analysis.songId !== songId) {
    throw new Error("Invalid song analysis.")
  }

  await writeFile(getAnalysisPath(songId), JSON.stringify(analysis), "utf8")

  const metadata = await readSongMetadata(songId)
  const updatedMetadata = {
    ...metadata,
    durationMs: analysis.durationMs,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(
    getMetadataPath(songId),
    JSON.stringify(updatedMetadata, null, 2),
    "utf8",
  )

  return updatedMetadata
}

export async function createSongFromUpload(file: File): Promise<SongSummary> {
  if (!isAudioMimeType(file.type)) {
    throw new Error("Only audio files can be uploaded.")
  }

  if (file.size <= 0 || file.size > maxSongUploadBytes) {
    throw new Error("Audio file is too large.")
  }

  await ensureSongRoot()
  const songId = createSongId()
  const songDirectory = getSongDirectory(songId)
  const audioFileName = `audio${getExtension(file.name)}`
  const now = new Date().toISOString()
  const metadata: SongMetadata = {
    id: songId,
    title: sanitizeTitle(file.name),
    originalFileName: file.name,
    audioFileName,
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: now,
    updatedAt: now,
  }

  await mkdir(songDirectory, { recursive: true })
  await writeFile(
    path.join(songDirectory, audioFileName),
    Buffer.from(await file.arrayBuffer()),
  )
  await writeFile(getMetadataPath(songId), JSON.stringify(metadata, null, 2), "utf8")

  return { ...metadata, hasAnalysis: false }
}

export async function getSongAudioFile(songId: string) {
  const metadata = await readSongMetadata(songId)
  const filePath = path.join(getSongDirectory(songId), metadata.audioFileName)
  const fileStat = await stat(filePath)

  return { filePath, fileStat, metadata }
}

export async function deleteSong(songId: string) {
  const songDirectory = getSongDirectory(songId)

  await rm(songDirectory, { recursive: true, force: false })
}
