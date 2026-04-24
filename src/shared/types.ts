export interface GeoData {
  latitude: number
  longitude: number
  altitude: number
}

export interface ParsedMetadata {
  title: string
  description: string
  photoTakenTime: string | null // ISO string (serializable over IPC)
  creationTime: string | null
  geoData: GeoData | null
  geoDataExif: GeoData | null
  people: string[]
}

export interface MatchedPair {
  id: string
  mediaPath: string
  jsonPath: string
  relativePath: string
  metadata: ParsedMetadata
  status: 'ready' | 'warning' | 'error'
  error?: string
}

export interface ScanResult {
  matched: MatchedPair[]
  orphanedJsons: string[]
  unmatchedMedia: string[]
  totalFilesScanned: number
}

export interface MergeOptions {
  mode: 'overwrite' | 'copy'
  outputPath?: string
  fields: {
    dateTime: boolean
    gps: boolean
    description: boolean
    people: boolean
    title: boolean
  }
}

export interface ProgressEvent {
  current: number
  total: number
  currentFile: string
  status: 'processing' | 'done' | 'cancelled' | 'error'
}

export interface MergeResult {
  succeeded: number
  failed: number
  skipped: number
  errors: Array<{ filePath: string; error: string }>
}
