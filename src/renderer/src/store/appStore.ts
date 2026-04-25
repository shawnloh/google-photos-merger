import { create } from 'zustand'
import type { MatchedPair, ScanResult, MergeOptions, MergeResult, ParsedMetadata } from '../../../shared/types'

type Step = 1 | 2 | 3 | 4

interface AppState {
  step: Step
  folderPath: string | null
  scanResult: ScanResult | null
  selectedPairs: Set<string>
  mergeOptions: MergeOptions
  mergeResult: MergeResult | null
  isScanning: boolean
  isMerging: boolean

  setStep(step: Step): void
  setFolderPath(path: string): void
  setScanResult(result: ScanResult): void
  togglePairSelection(id: string): void
  selectAllPairs(): void
  deselectAllPairs(): void
  setMergeOptions(opts: Partial<MergeOptions>): void
  setMergeResult(result: MergeResult): void
  setIsScanning(v: boolean): void
  setIsMerging(v: boolean): void
  addManualPair(jsonPath: string, mediaPath: string): Promise<void>
  removePair(id: string): void
  reset(): void
}

const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  mode: 'copy',
  outputPath: undefined,
  fields: {
    dateTime: true,
    gps: true,
    description: true,
    people: true,
    title: true
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  step: 1,
  folderPath: null,
  scanResult: null,
  selectedPairs: new Set(),
  mergeOptions: DEFAULT_MERGE_OPTIONS,
  mergeResult: null,
  isScanning: false,
  isMerging: false,

  setStep: (step) => set({ step }),
  setFolderPath: (path) => set({ folderPath: path }),
  setScanResult: (result) =>
    set({
      scanResult: result,
      selectedPairs: new Set(result.matched.map((p) => p.id))
    }),
  togglePairSelection: (id) => {
    const next = new Set(get().selectedPairs)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selectedPairs: next })
  },
  selectAllPairs: () => {
    const ids = get().scanResult?.matched.map((p) => p.id) ?? []
    set({ selectedPairs: new Set(ids) })
  },
  deselectAllPairs: () => set({ selectedPairs: new Set() }),
  setMergeOptions: (opts) =>
    set((s) => ({ mergeOptions: { ...s.mergeOptions, ...opts } })),
  setMergeResult: (result) => set({ mergeResult: result }),
  setIsScanning: (v) => set({ isScanning: v }),
  setIsMerging: (v) => set({ isMerging: v }),

  addManualPair: async (jsonPath: string, mediaPath: string) => {
    const current = get().scanResult
    if (!current) return
    let metadata: ParsedMetadata
    try {
      metadata = await window.api.parseMetadata(jsonPath)
    } catch {
      metadata = {
        title: '',
        description: '',
        photoTakenTime: null,
        creationTime: null,
        geoData: null,
        geoDataExif: null,
        people: []
      }
    }
    const newPair: MatchedPair = {
      id: crypto.randomUUID(),
      mediaPath,
      jsonPath,
      relativePath: mediaPath,
      metadata,
      status: 'ready',
      matchType: 'manual'
    }
    set((s) => ({
      scanResult: {
        ...s.scanResult!,
        matched: [...s.scanResult!.matched, newPair],
        orphanedJsons: s.scanResult!.orphanedJsons.filter((j) => j !== jsonPath)
      },
      selectedPairs: new Set([...s.selectedPairs, newPair.id])
    }))
  },

  removePair: (id: string) => {
    const current = get().scanResult
    if (!current) return
    const pair = current.matched.find((p) => p.id === id)
    if (!pair) return
    const shouldReturnToOrphans = pair.matchType === 'manual' || pair.matchType === 'cross-chunk'
    set((s) => {
      const next = new Set(s.selectedPairs)
      next.delete(id)
      return {
        scanResult: {
          ...s.scanResult!,
          matched: s.scanResult!.matched.filter((p) => p.id !== id),
          orphanedJsons:
            shouldReturnToOrphans && !s.scanResult!.orphanedJsons.includes(pair.jsonPath)
              ? [...s.scanResult!.orphanedJsons, pair.jsonPath]
              : s.scanResult!.orphanedJsons
        },
        selectedPairs: next
      }
    })
  },

  reset: () =>
    set({
      step: 1,
      folderPath: null,
      scanResult: null,
      selectedPairs: new Set(),
      mergeOptions: DEFAULT_MERGE_OPTIONS,
      mergeResult: null,
      isScanning: false,
      isMerging: false
    })
}))

export function getSelectedPairs(state: AppState): MatchedPair[] {
  return state.scanResult?.matched.filter((p) => state.selectedPairs.has(p.id)) ?? []
}
