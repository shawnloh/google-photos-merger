import { promises as fs, Dirent } from 'fs'
import { join, dirname, basename } from 'path'
import type { ScanResult, MatchedPair } from '../../shared/types'
import { parseMetadata } from './parser'
import { randomUUID } from 'crypto'

const MEDIA_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.tiff',
  '.tif',
  '.webp',
  '.gif',
  '.mov',
  '.mp4',
  '.avi',
  '.mkv',
  '.m4v',
  '.3gp'
])

const SIDECAR_SUFFIX = '.supplemental-metadata.json'

export async function scanFolder(rootPath: string): Promise<ScanResult> {
  const allFiles: string[] = []
  await walkDir(rootPath, allFiles)

  const sidecars = allFiles.filter((f) => f.endsWith(SIDECAR_SUFFIX))
  const mediaSet = new Set(allFiles.filter((f) => isMediaFile(f)))

  // Build global media index: lowercased base name → all media paths with that name
  const globalMediaIndex = buildGlobalMediaIndex(mediaSet)

  const matched: MatchedPair[] = []
  const orphanedJsons: string[] = []
  const matchedMediaPaths = new Set<string>()

  // Pass 1: same-directory matching (unchanged logic)
  for (const jsonPath of sidecars) {
    const dir = dirname(jsonPath)
    const base = extractBaseName(jsonPath)
    const mediaPath = findMediaFile(dir, base, mediaSet)

    if (!mediaPath) {
      orphanedJsons.push(jsonPath)
      continue
    }

    matchedMediaPaths.add(mediaPath)
    matched.push(await buildPair(jsonPath, mediaPath, rootPath, 'same-dir'))
  }

  // Pass 2: cross-chunk matching for remaining orphans
  const stillOrphaned: string[] = []
  for (const jsonPath of orphanedJsons) {
    const lowerBase = extractBaseName(jsonPath).toLowerCase()

    const candidates = (globalMediaIndex.get(lowerBase) ?? []).filter(
      (p) => !matchedMediaPaths.has(p)
    )

    if (candidates.length === 0) {
      stillOrphaned.push(jsonPath)
      continue
    }

    const mediaPath =
      candidates.length === 1
        ? candidates[0]
        : pickBestCandidate(jsonPath, candidates)

    matchedMediaPaths.add(mediaPath)
    matched.push(await buildPair(jsonPath, mediaPath, rootPath, 'cross-chunk'))
  }

  const unmatchedMedia = [...mediaSet].filter((m) => !matchedMediaPaths.has(m))

  return {
    matched,
    orphanedJsons: stillOrphaned,
    unmatchedMedia,
    totalFilesScanned: allFiles.length
  }
}

function extractBaseName(jsonPath: string): string {
  const rawBase = basename(jsonPath, SIDECAR_SUFFIX)
  const mediaExtInBase = rawBase.slice(rawBase.lastIndexOf('.')).toLowerCase()
  return MEDIA_EXTENSIONS.has(mediaExtInBase)
    ? rawBase.slice(0, rawBase.lastIndexOf('.'))
    : rawBase
}

function buildGlobalMediaIndex(mediaSet: Set<string>): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const mediaPath of mediaSet) {
    const name = basename(mediaPath)
    const dotIdx = name.lastIndexOf('.')
    if (dotIdx === -1) continue
    const key = name.slice(0, dotIdx).toLowerCase()
    const existing = index.get(key)
    if (existing) {
      existing.push(mediaPath)
    } else {
      index.set(key, [mediaPath])
    }
  }
  return index
}

/** Pick the candidate whose parent directory shares the most path segments with the JSON's parent. */
function pickBestCandidate(jsonPath: string, candidates: string[]): string {
  const jsonSegments = dirname(jsonPath).split(/[/\\]/)
  let best = candidates[0]
  let bestScore = -1
  for (const candidate of candidates) {
    const candidateSegments = dirname(candidate).split(/[/\\]/)
    let score = 0
    const minLen = Math.min(jsonSegments.length, candidateSegments.length)
    for (let i = 0; i < minLen; i++) {
      if (jsonSegments[jsonSegments.length - 1 - i].toLowerCase() === candidateSegments[candidateSegments.length - 1 - i].toLowerCase()) {
        score++
      } else {
        break
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

async function buildPair(
  jsonPath: string,
  mediaPath: string,
  rootPath: string,
  matchType: 'same-dir' | 'cross-chunk'
): Promise<MatchedPair> {
  try {
    const metadata = await parseMetadata(jsonPath)
    return {
      id: randomUUID(),
      mediaPath,
      jsonPath,
      relativePath: mediaPath.slice(rootPath.length + 1),
      metadata,
      status: 'ready',
      matchType
    }
  } catch (err) {
    return {
      id: randomUUID(),
      mediaPath,
      jsonPath,
      relativePath: mediaPath.slice(rootPath.length + 1),
      metadata: {
        title: '',
        description: '',
        photoTakenTime: null,
        creationTime: null,
        geoData: null,
        geoDataExif: null,
        people: []
      },
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      matchType
    }
  }
}

async function walkDir(dir: string, results: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, String(entry.name))
    if (entry.isDirectory()) {
      await walkDir(fullPath, results)
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }
}

function isMediaFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return MEDIA_EXTENSIONS.has(ext)
}

function findMediaFile(dir: string, base: string, mediaSet: Set<string>): string | null {
  // Try exact lowercase extension match first
  for (const ext of MEDIA_EXTENSIONS) {
    const candidate = join(dir, base + ext)
    if (mediaSet.has(candidate)) return candidate
  }

  // Try uppercase extension variants (e.g. photo.JPG, video.MOV)
  for (const ext of MEDIA_EXTENSIONS) {
    const candidate = join(dir, base + ext.toUpperCase())
    if (mediaSet.has(candidate)) return candidate
  }

  // Fallback: scan mediaSet for files in the same dir whose lowercased name matches
  // This handles mixed-case extensions like .Jpg, .Mov, etc.
  const lowerBase = base.toLowerCase()
  for (const mediaPath of mediaSet) {
    if (dirname(mediaPath) !== dir) continue
    const mediaBase = basename(mediaPath)
    const dotIdx = mediaBase.lastIndexOf('.')
    if (dotIdx === -1) continue
    const mediaName = mediaBase.slice(0, dotIdx).toLowerCase()
    const mediaExt = mediaBase.slice(dotIdx).toLowerCase()
    if (mediaName === lowerBase && MEDIA_EXTENSIONS.has(mediaExt)) {
      return mediaPath
    }
  }

  // Truncated filename fallback: Google Takeout sometimes shortens long filenames in the JSON name
  // Try prefix match — if base is a prefix of a media filename (or vice versa) in the same dir
  for (const mediaPath of mediaSet) {
    if (dirname(mediaPath) !== dir) continue
    const mediaBase = basename(mediaPath)
    const dotIdx = mediaBase.lastIndexOf('.')
    if (dotIdx === -1) continue
    const mediaName = mediaBase.slice(0, dotIdx).toLowerCase()
    const mediaExt = mediaBase.slice(dotIdx).toLowerCase()
    if (!MEDIA_EXTENSIONS.has(mediaExt)) continue
    if (mediaName.startsWith(lowerBase) || lowerBase.startsWith(mediaName)) {
      return mediaPath
    }
  }

  return null
}
