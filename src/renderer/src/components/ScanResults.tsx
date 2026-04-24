import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { MatchedPair } from '@shared/types'

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

export default function ScanResults(): JSX.Element {
  const { scanResult, selectedPairs, togglePairSelection, selectAllPairs, deselectAllPairs, setStep } =
    useAppStore()
  const [search, setSearch] = useState('')

  if (!scanResult) return <div className="p-8 text-gray-400">No scan results.</div>

  const { matched, orphanedJsons, unmatchedMedia, totalFilesScanned } = scanResult

  const imageCount = matched.filter((p) => getFileType(p.mediaPath) === 'image').length
  const videoCount = matched.filter((p) => getFileType(p.mediaPath) === 'video').length

  const filtered = matched.filter(
    (p) =>
      !search ||
      p.relativePath.toLowerCase().includes(search.toLowerCase()) ||
      p.metadata.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 p-6 pb-3 border-b border-gray-800">
        <StatCard label="Files Scanned" value={totalFilesScanned} color="text-gray-200" />
        <StatCard label="Matched Pairs" value={matched.length} color="text-green-400" />
        <StatCard label="No Metadata" value={unmatchedMedia.length} color="text-gray-400" />
      </div>
      {/* File type breakdown */}
      <div className="grid grid-cols-3 gap-4 px-6 pb-4 pt-3 border-b border-gray-800">
        <StatCard label="Images" value={imageCount} color="text-blue-400" />
        <StatCard label="Videos" value={videoCount} color="text-purple-400" />
        <StatCard label="Orphaned JSON" value={orphanedJsons.length} color="text-yellow-400" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-800">
        <input
          type="search"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={selectAllPairs}
          className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={deselectAllPairs}
          className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
        >
          Deselect All
        </button>
        <span className="text-sm text-gray-500">
          {selectedPairs.size} / {matched.length} selected
        </span>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No matched pairs found.</div>
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((pair) => (
                <FileRow
                  key={pair.id}
                  pair={pair}
                  checked={selectedPairs.has(pair.id)}
                  onToggle={() => togglePairSelection(pair.id)}
                  fileType={getFileType(pair.mediaPath)}
                  fileExt={getExt(pair.mediaPath).slice(1).toUpperCase()}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
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

function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}): JSX.Element {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function FileRow({
  pair,
  checked,
  onToggle,
  fileType,
  fileExt
}: {
  pair: MatchedPair
  checked: boolean
  onToggle: () => void
  fileType: 'image' | 'video' | 'other'
  fileExt: string
}): JSX.Element {
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
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-brand-500"
        />
      </td>
      <td className="px-4 py-2 text-gray-200 font-mono text-xs truncate max-w-xs">
        {pair.relativePath}
      </td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 rounded text-xs font-medium font-mono ${typeBadgeStyle}`}>
          {fileExt || '?'}
        </span>
      </td>
      <td className="px-4 py-2 text-gray-400">{date}</td>
      <td className="px-4 py-2">
        {hasGps ? (
          <span className="text-green-400 text-xs">Yes</span>
        ) : (
          <span className="text-gray-600 text-xs">No</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-400 text-xs">
        {metadata.people.length > 0 ? metadata.people.join(', ') : '—'}
      </td>
      <td className="px-4 py-2">
        <StatusBadge status={status} />
      </td>
    </tr>
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
