import type { MatchedPair, MergeOptions, ParsedMetadata, ScanResult, MergeResult, ProgressEvent } from '@shared/types'

declare global {
  interface Window {
    api: {
      selectFolder(): Promise<string | null>
      selectFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null>
      scanFolder(path: string): Promise<ScanResult>
      parseMetadata(jsonPath: string): Promise<ParsedMetadata>
      mergeMetadata(pairs: MatchedPair[], options: MergeOptions): Promise<MergeResult>
      cancelMerge(): Promise<void>
      openPath(path: string): Promise<void>
      onMergeProgress(callback: (event: ProgressEvent) => void): () => void
    }
  }
}
