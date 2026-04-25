import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { MatchedPair } from '@shared/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif', '.webp', '.gif'])
const VIDEO_EXTENSIONS = new Set(['.mov', '.mp4', '.avi', '.mkv', '.m4v', '.3gp'])

function getExt(filePath: string): string {
  const sep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const name = filePath.slice(sep + 1)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function getFileType(filePath: string): 'image' | 'video' | 'other' {
  const ext = getExt(filePath)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return 'other'
}

function chunkName(filePath: string): string {
  // Extract the first path segment after the root (e.g. "Takeout 7")
  const parts = filePath.replace(/\\/g, '/').split('/')
  // Find the segment that looks like a Takeout chunk or just return the parent folder
  return parts.find((p) => /takeout/i.test(p)) ?? parts[parts.length - 2] ?? ''
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }): JSX.Element {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: MatchedPair['status'] }): JSX.Element {
  const styles = {
    ready: 'bg-green-900 text-green-300',
    warning: 'bg-yellow-900 text-yellow-300',
    error: 'bg-red-900 text-red-300'
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>{status}</span>
  )
}

function FileRow({
  pair,
  checked,
  onToggle,
  onRemove,
  showChunkBadge = false
}: {
  pair: MatchedPair
  checked: boolean
  onToggle: () => void
  onRemove: () => void
  showChunkBadge?: boolean
}): JSX.Element {
  const fileType = getFileType(pair.mediaPath)
  const fileExt = getExt(pair.mediaPath).slice(1).toUpperCase()
  const { metadata, status } = pair
  const date = metadata.photoTakenTime
    ? new Date(metadata.photoTakenTime).toLocaleDateString()
    : metadata.creationTime
      ? new Date(metadata.creationTime).toLocaleDateString()
      : '—'
  const hasGps = !!(metadata.geoDataExif ?? metadata.geoData)
  const typeBadgeStyle =
    fileType === 'image'
      ? 'bg-blue-900 text-blue-300'
      : fileType === 'video'
        ? 'bg-purple-900 text-purple-300'
        : 'bg-gray-800 text-gray-400'

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
      <td className="px-4 py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-brand-500" />
      </td>
      <td className="px-4 py-2 text-gray-200 font-mono text-xs truncate max-w-xs">
        {pair.relativePath}
        {showChunkBadge && (
          <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-300">
            {chunkName(pair.jsonPath)}
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium font-mono ${typeBadgeStyle}`}>
          {fileExt || '?'}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-400">{date}</td>
      <td className="px-4 py-2">
        {hasGps ? <span className="text-green-400 text-xs">Yes</span> : <span className="text-gray-600 text-xs">No</span>}
      </td>
      <td className="px-4 py-2 text-gray-400 text-xs">
        {metadata.people.length > 0 ? metadata.people.join(', ') : '—'}
      </td>
      <td className="px-4 py-2">
        <StatusBadge status={status} />
      </td>
      <td className="px-4 py-2">
        <button
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          title="Remove pair"
        >
          Remove
        </button>
      </td>
    </tr>
  )
}

// ─── Tab panels ─────────────────────────────────────────────────────────────

function MatchedTab({ pairs, selectedPairs, onToggle, onRemove, showChunkBadge = false }: {
  pairs: MatchedPair[]
  selectedPairs: Set<string>
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  showChunkBadge?: boolean
}): JSX.Element {
  const [search, setSearch] = useState('')
  const filtered = pairs.filter(
    (p) =>
      !search ||
      p.relativePath.toLowerCase().includes(search.toLowerCase()) ||
      p.metadata.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-800">
        <input
          type="search"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No files.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="w-10 px-4 py-2" />
                <th className="text-left px-4 py-2 text-gray-400 font-medium">File</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Type</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Date</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">GPS</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">People</th>
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Status</th>
                <th className="w-16 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((pair) => (
                <FileRow
                  key={pair.id}
                  pair={pair}
                  checked={selectedPairs.has(pair.id)}
                  onToggle={() => onToggle(pair.id)}
                  onRemove={() => onRemove(pair.id)}
                  showChunkBadge={showChunkBadge}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function OrphanedJsonsTab({ orphanedJsons, onLink }: {
  orphanedJsons: string[]
  onLink: (jsonPath: string) => Promise<void>
}): JSX.Element {
  const [linking, setLinking] = useState<string | null>(null)

  async function handleLink(jsonPath: string): Promise<void> {
    setLinking(jsonPath)
    try {
      await onLink(jsonPath)
    } finally {
      setLinking(null)
    }
  }

  if (orphanedJsons.length === 0) {
    return <div className="p-8 text-center text-gray-500">No orphaned JSON files.</div>
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
          <tr>
            <th className="text-left px-4 py-2 text-gray-400 font-medium">JSON Sidecar</th>
            <th className="text-left px-4 py-2 text-gray-400 font-medium">Path</th>
            <th className="w-32 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {orphanedJsons.map((jsonPath) => {
            const name = jsonPath.replace(/\\/g, '/').split('/').pop() ?? jsonPath
            const isLinking = linking === jsonPath
            return (
              <tr key={jsonPath} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                <td className="px-4 py-2 text-gray-200 font-mono text-xs">{name}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs truncate max-w-xs">{jsonPath}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleLink(jsonPath)}
                    disabled={isLinking}
                    className="px-3 py-1 text-xs bg-yellow-900 hover:bg-yellow-800 disabled:opacity-50 text-yellow-200 rounded transition-colors"
                  >
                    {isLinking ? 'Linking…' : 'Link to file…'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function UnmatchedMediaTab({ unmatchedMedia }: { unmatchedMedia: string[] }): JSX.Element {
  if (unmatchedMedia.length === 0) {
    return <div className="p-8 text-center text-gray-500">All media files have metadata sidecars.</div>
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
          <tr>
            <th className="text-left px-4 py-2 text-gray-400 font-medium">File</th>
            <th className="text-left px-4 py-2 text-gray-400 font-medium">Path</th>
          </tr>
        </thead>
        <tbody>
          {unmatchedMedia.map((mediaPath) => {
            const name = mediaPath.replace(/\\/g, '/').split('/').pop() ?? mediaPath
            return (
              <tr key={mediaPath} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                <td className="px-4 py-2 text-gray-400 font-mono text-xs">{name}</td>
                <td className="px-4 py-2 text-gray-600 font-mono text-xs truncate max-w-md">{mediaPath}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type TabId = 'matched' | 'cross-chunk' | 'orphaned' | 'unmatched'

export default function ScanResults(): JSX.Element {
  const {
    scanResult,
    selectedPairs,
    togglePairSelection,
    selectAllPairs,
    deselectAllPairs,
    setStep,
    addManualPair,
    removePair
  } = useAppStore()
  const [activeTab, setActiveTab] = useState<TabId>('matched')

  if (!scanResult) return <div className="p-8 text-gray-400">No scan results.</div>

  const { matched, orphanedJsons, unmatchedMedia, totalFilesScanned } = scanResult
  const sameDirPairs = matched.filter((p) => p.matchType === 'same-dir')
  const crossChunkPairs = matched.filter((p) => p.matchType === 'cross-chunk' || p.matchType === 'manual')

  async function handleLinkOrphan(jsonPath: string): Promise<void> {
    const mediaPath = await window.api.selectFile()
    if (!mediaPath) return
    await addManualPair(jsonPath, mediaPath)
    setActiveTab('matched')
  }

  const tabs: { id: TabId; label: string; count: number; color: string }[] = [
    { id: 'matched', label: 'Matched', count: sameDirPairs.length, color: 'text-green-400' },
    { id: 'cross-chunk', label: 'Cross-Chunk', count: crossChunkPairs.length, color: 'text-blue-400' },
    { id: 'orphaned', label: 'Orphaned JSONs', count: orphanedJsons.length, color: 'text-yellow-400' },
    { id: 'unmatched', label: 'Unmatched Media', count: unmatchedMedia.length, color: 'text-gray-400' }
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 p-6 pb-4 border-b border-gray-800">
        <StatCard label="Files Scanned" value={totalFilesScanned} color="text-gray-200" />
        <StatCard label="Matched" value={matched.length} color="text-green-400" />
        <StatCard label="Orphaned JSONs" value={orphanedJsons.length} color="text-yellow-400" />
        <StatCard label="No Metadata" value={unmatchedMedia.length} color="text-gray-400" />
      </div>

      {/* Tab bar + select controls */}
      <div className="flex items-center justify-between px-6 border-b border-gray-800">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
              <span className={`text-xs font-mono ${tab.color}`}>{tab.count}</span>
            </button>
          ))}
        </div>
        {(activeTab === 'matched' || activeTab === 'cross-chunk') && (
          <div className="flex items-center gap-4 py-2">
            <button onClick={selectAllPairs} className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
              Select All
            </button>
            <button onClick={deselectAllPairs} className="text-sm text-gray-400 hover:text-gray-300 transition-colors">
              Deselect All
            </button>
            <span className="text-sm text-gray-500">{selectedPairs.size} / {matched.length} selected</span>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'matched' && (
          <MatchedTab
            pairs={sameDirPairs}
            selectedPairs={selectedPairs}
            onToggle={togglePairSelection}
            onRemove={removePair}
          />
        )}
        {activeTab === 'cross-chunk' && (
          <MatchedTab
            pairs={crossChunkPairs}
            selectedPairs={selectedPairs}
            onToggle={togglePairSelection}
            onRemove={removePair}
            showChunkBadge
          />
        )}
        {activeTab === 'orphaned' && (
          <OrphanedJsonsTab orphanedJsons={orphanedJsons} onLink={handleLinkOrphan} />
        )}
        {activeTab === 'unmatched' && (
          <UnmatchedMediaTab unmatchedMedia={unmatchedMedia} />
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
        <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors">
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={selectedPairs.size === 0}
          className="px-6 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          Continue ({selectedPairs.size} files)
        </button>
      </div>
    </div>
  )
}
