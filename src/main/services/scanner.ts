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

  const matched: MatchedPair[] = []
  const orphanedJsons: string[] = []
  const matchedMediaPaths = new Set<string>()

  for (const jsonPath of sidecars) {
    const dir = dirname(jsonPath)
    const rawBase = basename(jsonPath, SIDECAR_SUFFIX)
    // Handle both naming patterns:
    // Pattern A: photo.supplemental-metadata.json → base = "photo"
    // Pattern B: photo.jpg.supplemental-metadata.json → rawBase = "photo.jpg", strip media ext
    const mediaExtInBase = rawBase.slice(rawBase.lastIndexOf('.')).toLowerCase()
    const base =
      MEDIA_EXTENSIONS.has(mediaExtInBase) ? rawBase.slice(0, rawBase.lastIndexOf('.')) : rawBase
    const mediaPath = findMediaFile(dir, base, mediaSet)

    if (!mediaPath) {
      orphanedJsons.push(jsonPath)
      continue
    }

    matchedMediaPaths.add(mediaPath)

    let pair: MatchedPair
    try {
      const metadata = await parseMetadata(jsonPath)
      pair = {
        id: randomUUID(),
        mediaPath,
        jsonPath,
        relativePath: mediaPath.slice(rootPath.length + 1),
        metadata,
        status: 'ready'
      }
    } catch (err) {
      pair = {
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
        error: err instanceof Error ? err.message : String(err)
      }
    }

    matched.push(pair)
  }

  const unmatchedMedia = [...mediaSet].filter((m) => !matchedMediaPaths.has(m))

  return {
    matched,
    orphanedJsons,
    unmatchedMedia,
    totalFilesScanned: allFiles.length
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
