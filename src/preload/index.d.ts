import type { MatchedPair, MergeOptions, ScanResult, MergeResult, ProgressEvent } from '@shared/types'

declare global {
  interface Window {
    api: {
      selectFolder(): Promise<string | null>
      scanFolder(path: string): Promise<ScanResult>
      mergeMetadata(pairs: MatchedPair[], options: MergeOptions): Promise<MergeResult>
      cancelMerge(): Promise<void>
      openPath(path: string): Promise<void>
      onMergeProgress(callback: (event: ProgressEvent) => void): () => void
    }
  }
}
