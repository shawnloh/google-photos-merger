import { promises as fs } from 'fs'
import type { ParsedMetadata, GeoData } from '../../shared/types'

interface RawMetadata {
  title?: string
  description?: string
  photoTakenTime?: { timestamp?: string }
  creationTime?: { timestamp?: string }
  geoData?: { latitude?: number; longitude?: number; altitude?: number }
  geoDataExif?: { latitude?: number; longitude?: number; altitude?: number }
  people?: Array<{ name?: string }>
}

export async function parseMetadata(jsonPath: string): Promise<ParsedMetadata> {
  const raw = await fs.readFile(jsonPath, 'utf-8')
  let data: RawMetadata
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in sidecar: ${jsonPath}`)
  }

  const photoTakenTime = parseTimestamp(data.photoTakenTime?.timestamp)
  const creationTime = parseTimestamp(data.creationTime?.timestamp)
  const geoData = parseGeo(data.geoData)
  const geoDataExif = parseGeo(data.geoDataExif)

  return {
    title: data.title ?? '',
    description: data.description ?? '',
    photoTakenTime: photoTakenTime?.toISOString() ?? null,
    creationTime: creationTime?.toISOString() ?? null,
    geoData,
    geoDataExif,
    people: (data.people ?? []).map((p) => p.name ?? '').filter(Boolean)
  }
}

function parseTimestamp(ts: string | undefined): Date | null {
  if (!ts) return null
  const epoch = parseInt(ts, 10)
  if (isNaN(epoch) || epoch === 0) return null
  return new Date(epoch * 1000)
}

function parseGeo(
  geo: { latitude?: number; longitude?: number; altitude?: number } | undefined
): GeoData | null {
  if (!geo) return null
  const { latitude = 0, longitude = 0, altitude = 0 } = geo
  if (latitude === 0 && longitude === 0) return null
  return { latitude, longitude, altitude }
}
