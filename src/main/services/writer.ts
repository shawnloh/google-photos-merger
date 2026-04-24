import { exiftool } from 'exiftool-vendored'
import { promises as fs } from 'fs'
import { join, dirname, basename } from 'path'
import type { MatchedPair, MergeOptions, MergeResult, ProgressEvent } from '../../shared/types'

type ProgressCallback = (event: ProgressEvent) => void

let cancelRequested = false

export function requestCancel(): void {
  cancelRequested = true
}

export async function mergeMetadata(
  pairs: MatchedPair[],
  options: MergeOptions,
  onProgress: ProgressCallback
): Promise<MergeResult> {
  cancelRequested = false
  const result: MergeResult = { succeeded: 0, failed: 0, skipped: 0, errors: [] }
  const BATCH_SIZE = 5

  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    if (cancelRequested) {
      onProgress({ current: i, total: pairs.length, currentFile: '', status: 'cancelled' })
      break
    }

    const batch = pairs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (pair, batchIdx) => {
        const idx = i + batchIdx
        onProgress({
          current: idx + 1,
          total: pairs.length,
          currentFile: pair.relativePath,
          status: 'processing'
        })

        try {
          const targetPath =
            options.mode === 'copy'
              ? await copyToOutput(pair.mediaPath, pair.relativePath, options.outputPath!)
              : pair.mediaPath

          await writeExif(targetPath, pair, options)
          result.succeeded++
        } catch (err) {
          result.failed++
          result.errors.push({
            filePath: pair.mediaPath,
            error: err instanceof Error ? err.message : String(err)
          })
        }
      })
    )
  }

  if (!cancelRequested) {
    onProgress({ current: pairs.length, total: pairs.length, currentFile: '', status: 'done' })
  }

  await exiftool.end()
  return result
}

async function copyToOutput(
  srcPath: string,
  relativePath: string,
  outputDir: string
): Promise<string> {
  const destPath = join(outputDir, relativePath)
  await fs.mkdir(dirname(destPath), { recursive: true })
  await fs.copyFile(srcPath, destPath)
  return destPath
}

async function writeExif(
  filePath: string,
  pair: MatchedPair,
  options: MergeOptions
): Promise<void> {
  const { metadata, status } = pair
  if (status === 'error') return

  const tags: Record<string, unknown> = {}
  const { fields } = options

  if (fields.title && metadata.title) {
    tags['XMP:Title'] = metadata.title
  }

  if (fields.description && metadata.description) {
    tags['EXIF:ImageDescription'] = metadata.description
    tags['XMP:Description'] = metadata.description
  }

  if (fields.dateTime) {
    const ts = metadata.photoTakenTime ?? metadata.creationTime
    if (ts) {
      const exifDate = isoToExifDate(ts)
      tags['EXIF:DateTimeOriginal'] = exifDate
      if (!metadata.photoTakenTime && metadata.creationTime) {
        tags['EXIF:CreateDate'] = exifDate
      }
    }
  }

  if (fields.gps) {
    const geo = metadata.geoDataExif ?? metadata.geoData
    if (geo) {
      tags['EXIF:GPSLatitude'] = Math.abs(geo.latitude)
      tags['EXIF:GPSLatitudeRef'] = geo.latitude >= 0 ? 'N' : 'S'
      tags['EXIF:GPSLongitude'] = Math.abs(geo.longitude)
      tags['EXIF:GPSLongitudeRef'] = geo.longitude >= 0 ? 'E' : 'W'
      if (geo.altitude !== 0) {
        tags['EXIF:GPSAltitude'] = Math.abs(geo.altitude)
        tags['EXIF:GPSAltitudeRef'] = geo.altitude >= 0 ? 0 : 1
      }
    }
  }

  if (fields.people && metadata.people.length > 0) {
    tags['XMP:PersonInImage'] = metadata.people
  }

  if (Object.keys(tags).length === 0) return

  const writeArgs = options.mode === 'overwrite' ? ['-overwrite_original'] : []
  await exiftool.write(filePath, tags, writeArgs)
}

function isoToExifDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function getExifBasename(filePath: string): string {
  return basename(filePath)
}
