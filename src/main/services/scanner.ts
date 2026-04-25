import { promises as fs, Dirent } from 'fs'
import { join, dirname, basename } from 'path'
import type { ScanResult, MatchedPair, ParsedMetadata } from '../../shared/types'
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
// Google Takeout sometimes truncates long filenames at filesystem limits.
// The canonical suffix is ".supplemental-metadata.json" but may be truncated to
// ".supplemental-metadat.json" (missing trailing 'a'). We match both by detecting
// the common prefix ".supplemental-metadat" followed by an optional 'a' and ".json".
const SIDECAR_PATTERN = /\.supplemental-metadat(?:a)?\.json$/i

/** Maps lowercased file extensions to the format label returned by detectFormatFromBytes. */
const EXTENSION_FORMAT_MAP: Record<string, string | null> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.gif': 'gif',
  '.webp': 'webp',
  '.heic': 'heic',
  '.heif': 'heic',
  '.tiff': 'tiff',
  '.tif': 'tiff',
  '.mov': 'mp4',   // QuickTime uses same ftyp container
  '.mp4': 'mp4',
  '.m4v': 'mp4',
  '.avi': null,    // no reliable magic byte check
  '.mkv': null,
  '.3gp': null
}

/**
 * Given a sidecar path (which may have a truncated suffix), return the canonical
 * suffix length so we can strip it from the filename to get the base name.
 * e.g. "photo.jpg.supplemental-metadat.json" → strips ".supplemental-metadat.json"
 */
function getSidecarSuffixLength(filePath: string): number {
  // Full suffix takes priority
  if (filePath.endsWith(SIDECAR_SUFFIX)) return SIDECAR_SUFFIX.length
  // Truncated variant: ".supplemental-metadat.json"
  const TRUNCATED_SUFFIX = '.supplemental-metadat.json'
  if (filePath.endsWith(TRUNCATED_SUFFIX)) return TRUNCATED_SUFFIX.length
  // Fallback: match via regex and measure
  const m = filePath.match(SIDECAR_PATTERN)
  return m ? m[0].length : 0
}

export async function scanFolder(rootPath: string): Promise<ScanResult> {
  const allFiles: string[] = []
  await walkDir(rootPath, allFiles)

  const sidecars = allFiles.filter((f) => SIDECAR_PATTERN.test(f))
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
  const suffixLen = getSidecarSuffixLength(jsonPath)
  const rawBase = suffixLen > 0 ? basename(jsonPath).slice(0, -suffixLen) : basename(jsonPath)
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

/**
 * Returns a lowercase format label ('jpeg', 'png', 'gif', 'heic', 'mp4', 'webp', or null)
 * by reading the first 12 bytes of the file.
 */
async function detectFormatFromBytes(filePath: string): Promise<string | null> {
  let buf: Buffer
  try {
    const fd = await fs.open(filePath, 'r')
    try {
      buf = Buffer.alloc(12)
      const { bytesRead } = await fd.read(buf, 0, 12, 0)
      if (bytesRead < 4) return null
    } finally {
      await fd.close()
    }
  } catch {
    return null
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif'
  // WebP: RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp'
  // HEIC/HEIF: ....ftyphe (offset 4)
  if (buf.length >= 11 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70 &&
      buf[8] === 0x68 && buf[9] === 0x65) return 'heic'
  // MP4/MOV: ....ftyp (offset 4)
  if (buf.length >= 8 &&
      buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'mp4'

  return null
}

async function buildPair(
  jsonPath: string,
  mediaPath: string,
  rootPath: string,
  matchType: 'same-dir' | 'cross-chunk'
): Promise<MatchedPair> {
  let metadata: ParsedMetadata
  let status: MatchedPair['status'] = 'ready'
  let error: string | undefined
  let warning: string | undefined

  try {
    metadata = await parseMetadata(jsonPath)
  } catch (err) {
    metadata = {
      title: '',
      description: '',
      photoTakenTime: null,
      creationTime: null,
      geoData: null,
      geoDataExif: null,
      people: []
    }
    status = 'error'
    error = err instanceof Error ? err.message : String(err)
  }

  // Extension mismatch check (only when no error already)
  if (status === 'ready') {
    const ext = mediaPath.slice(mediaPath.lastIndexOf('.')).toLowerCase()
    const expectedFormat = EXTENSION_FORMAT_MAP[ext]
    if (expectedFormat !== undefined && expectedFormat !== null) {
      const actualFormat = await detectFormatFromBytes(mediaPath)
      if (actualFormat !== null && actualFormat !== expectedFormat) {
        status = 'warning'
        warning = `Extension mismatch: file is named ${ext.toUpperCase()} but contains ${actualFormat.toUpperCase()} data. ExifTool will still process it correctly.`
      }
    }
  }

  return {
    id: randomUUID(),
    mediaPath,
    jsonPath,
    relativePath: mediaPath.slice(rootPath.length + 1),
    metadata,
    status,
    ...(error !== undefined && { error }),
    ...(warning !== undefined && { warning }),
    matchType
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
