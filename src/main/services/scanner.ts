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
    const base = basename(jsonPath, SIDECAR_SUFFIX)
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
  for (const ext of MEDIA_EXTENSIONS) {
    const candidate = join(dir, base + ext)
    if (mediaSet.has(candidate)) return candidate
  }
  return null
}
