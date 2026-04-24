import { create } from 'zustand'
import type { MatchedPair, ScanResult, MergeOptions, MergeResult } from '../../../shared/types'

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
