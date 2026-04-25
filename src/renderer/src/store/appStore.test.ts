import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { useAppStore } from './appStore'
import type { ScanResult, ParsedMetadata } from '../../../shared/types'

const EMPTY_META: ParsedMetadata = {
  title: 'Test',
  description: '',
  photoTakenTime: null,
  creationTime: null,
  geoData: null,
  geoDataExif: null,
  people: []
}

const SCAN_RESULT: ScanResult = {
  matched: [
    {
      id: 'pair-1',
      mediaPath: '/root/Takeout 1/photo.jpg',
      jsonPath: '/root/Takeout 1/photo.jpg.supplemental-metadata.json',
      relativePath: 'Takeout 1/photo.jpg',
      metadata: EMPTY_META,
      status: 'ready',
      matchType: 'same-dir'
    }
  ],
  orphanedJsons: ['/root/Takeout 2/ghost.jpg.supplemental-metadata.json'],
  unmatchedMedia: [],
  totalFilesScanned: 3
}

// Mock window.api
vi.stubGlobal('api', {
  parseMetadata: vi.fn().mockResolvedValue(EMPTY_META)
})

describe('appStore — addManualPair', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setScanResult(SCAN_RESULT)
  })

  it('creates a manual MatchedPair and removes the JSON from orphanedJsons', async () => {
    await act(async () => {
      await useAppStore.getState().addManualPair(
        '/root/Takeout 2/ghost.jpg.supplemental-metadata.json',
        '/root/Takeout 3/ghost.jpg'
      )
    })
    const state = useAppStore.getState()
    expect(state.scanResult!.matched).toHaveLength(2)
    const newPair = state.scanResult!.matched.find((p) => p.matchType === 'manual')
    expect(newPair).toBeDefined()
    expect(newPair!.mediaPath).toBe('/root/Takeout 3/ghost.jpg')
    expect(newPair!.jsonPath).toBe('/root/Takeout 2/ghost.jpg.supplemental-metadata.json')
    expect(state.scanResult!.orphanedJsons).toHaveLength(0)
    expect(state.selectedPairs.has(newPair!.id)).toBe(true)
  })
})

describe('appStore — removePair', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
    useAppStore.getState().setScanResult(SCAN_RESULT)
  })

  it('removes a same-dir pair without moving JSON to orphanedJsons', () => {
    useAppStore.getState().removePair('pair-1')
    const state = useAppStore.getState()
    expect(state.scanResult!.matched).toHaveLength(0)
    // same-dir pairs do not go back to orphanedJsons
    expect(state.scanResult!.orphanedJsons).toHaveLength(1)
  })

  it('removes a cross-chunk pair and puts its JSON back in orphanedJsons', () => {
    // Seed a cross-chunk pair
    useAppStore.setState((s) => ({
      scanResult: {
        ...s.scanResult!,
        matched: [
          ...s.scanResult!.matched,
          {
            id: 'pair-cross',
            mediaPath: '/root/Takeout 1/beach.jpg',
            jsonPath: '/root/Takeout 2/beach.jpg.supplemental-metadata.json',
            relativePath: 'Takeout 1/beach.jpg',
            metadata: EMPTY_META,
            status: 'ready',
            matchType: 'cross-chunk'
          }
        ]
      }
    }))
    useAppStore.getState().removePair('pair-cross')
    const state = useAppStore.getState()
    expect(state.scanResult!.matched.find((p) => p.id === 'pair-cross')).toBeUndefined()
    expect(state.scanResult!.orphanedJsons).toContain(
      '/root/Takeout 2/beach.jpg.supplemental-metadata.json'
    )
  })

  it('removes a manual pair and puts its JSON back in orphanedJsons', async () => {
    await act(async () => {
      await useAppStore.getState().addManualPair(
        '/root/Takeout 2/ghost.jpg.supplemental-metadata.json',
        '/root/Takeout 3/ghost.jpg'
      )
    })
    const manualId = useAppStore
      .getState()
      .scanResult!.matched.find((p) => p.matchType === 'manual')!.id
    useAppStore.getState().removePair(manualId)
    const state = useAppStore.getState()
    expect(state.scanResult!.matched.find((p) => p.id === manualId)).toBeUndefined()
    expect(state.scanResult!.orphanedJsons).toContain(
      '/root/Takeout 2/ghost.jpg.supplemental-metadata.json'
    )
  })
})
