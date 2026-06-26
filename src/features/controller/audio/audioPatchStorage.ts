import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { isAudioCircleSettings } from "../../network/messageValidation.ts"
import type { AudioCircleSettings } from "../../network/protocolTypes"
import type { AudioPatchFile, SavedAudioPatch } from "./audioPatchTypes"

const defaultPatchFilePath = path.join(
  process.cwd(),
  "data",
  "audio-patches",
  "patches.json",
)

type AudioPatchStorageOptions = {
  filePath?: string
  now?: () => Date
}

type CreateAudioPatchInput = {
  name: string
  settings: AudioCircleSettings
}

function getPatchFilePath(options: AudioPatchStorageOptions = {}) {
  return options.filePath ?? defaultPatchFilePath
}

function createAudioPatchId() {
  return `audio-patch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isAudioPatchId(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 96 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

function sanitizePatchName(value: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 80)

  return name.length > 0 ? name : "Untitled patch"
}

function isIsoDateString(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isSavedAudioPatch(value: unknown): value is SavedAudioPatch {
  if (typeof value !== "object" || value === null) {
    return false
  }

  const patch = value as Partial<SavedAudioPatch>

  return (
    isAudioPatchId(patch.id) &&
    typeof patch.name === "string" &&
    patch.name.trim().length > 0 &&
    patch.name.length <= 80 &&
    isAudioCircleSettings(patch.settings) &&
    isIsoDateString(patch.createdAt) &&
    isIsoDateString(patch.updatedAt)
  )
}

function isAudioPatchFile(value: unknown): value is AudioPatchFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Partial<AudioPatchFile>).patches) &&
    (value as Partial<AudioPatchFile>).patches?.every(isSavedAudioPatch) === true
  )
}

async function readPatchFile(filePath: string): Promise<SavedAudioPatch[]> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"))

    if (!isAudioPatchFile(value)) {
      throw new Error("Invalid audio patch file.")
    }

    return value.patches
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return []
    }

    throw error
  }
}

async function writePatchFile(filePath: string, patches: SavedAudioPatch[]) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify({ patches }, null, 2), "utf8")
}

export async function listAudioPatches(
  options: AudioPatchStorageOptions = {},
): Promise<SavedAudioPatch[]> {
  const patches = await readPatchFile(getPatchFilePath(options))

  return [...patches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export async function createAudioPatch(
  input: CreateAudioPatchInput,
  options: AudioPatchStorageOptions = {},
): Promise<SavedAudioPatch> {
  if (typeof input.name !== "string") {
    throw new Error("Audio patch name is required.")
  }

  if (!isAudioCircleSettings(input.settings)) {
    throw new Error("Invalid audio patch settings.")
  }

  const filePath = getPatchFilePath(options)
  const patches = await readPatchFile(filePath)
  const timestamp = (options.now ?? (() => new Date()))().toISOString()
  const patch: SavedAudioPatch = {
    id: createAudioPatchId(),
    name: sanitizePatchName(input.name),
    settings: input.settings,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await writePatchFile(filePath, [patch, ...patches])

  return patch
}

export async function deleteAudioPatch(
  patchId: string,
  options: AudioPatchStorageOptions = {},
) {
  if (!isAudioPatchId(patchId)) {
    throw new Error("Invalid audio patch id.")
  }

  const filePath = getPatchFilePath(options)
  const patches = await readPatchFile(filePath)
  const nextPatches = patches.filter((patch) => patch.id !== patchId)

  if (nextPatches.length === patches.length) {
    throw new Error("Audio patch not found.")
  }

  await writePatchFile(filePath, nextPatches)
}
