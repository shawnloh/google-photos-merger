import { useState, useEffect, useRef } from 'react'
import { useAppStore, getSelectedPairs } from '../store/appStore'
import type { ProgressEvent } from '@shared/types'

export default function MergeConfig(): JSX.Element {
  const store = useAppStore()
  const { mergeOptions, setMergeOptions, setMergeResult, setStep, isMerging, setIsMerging } = store
  const selectedPairs = getSelectedPairs(store)

  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  async function handleSelectOutput(): Promise<void> {
    const path = await window.api.selectFolder()
    if (path) setMergeOptions({ outputPath: path })
  }

  async function handleStartMerge(): Promise<void> {
    if (mergeOptions.mode === 'copy' && !mergeOptions.outputPath) return

    setIsMerging(true)
    setProgress({ current: 0, total: selectedPairs.length, currentFile: '', status: 'processing' })

    cleanupRef.current = window.api.onMergeProgress((event) => {
      setProgress(event)
    })

    try {
      const result = await window.api.mergeMetadata(selectedPairs, mergeOptions)
      setMergeResult(result)
      setStep(4)
    } finally {
      cleanupRef.current?.()
      cleanupRef.current = null
      setIsMerging(false)
    }
  }

  async function handleCancel(): Promise<void> {
    await window.api.cancelMerge()
  }

  const fields = mergeOptions.fields

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8 max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold text-white mb-6">Merge Configuration</h2>

        {/* Output mode */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Output Mode
          </h3>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="copy"
                checked={mergeOptions.mode === 'copy'}
                onChange={() => setMergeOptions({ mode: 'copy' })}
                className="mt-1 accent-brand-500"
              />
              <div>
                <p className="text-gray-200 font-medium">Copy to output folder (recommended)</p>
                <p className="text-gray-500 text-sm">
                  Creates a copy of each file with metadata applied. Originals are untouched.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="overwrite"
                checked={mergeOptions.mode === 'overwrite'}
                onChange={() => setMergeOptions({ mode: 'overwrite' })}
                className="mt-1 accent-brand-500"
              />
              <div>
                <p className="text-gray-200 font-medium">Modify originals</p>
                <p className="text-gray-500 text-sm">
                  Writes metadata directly into the original files. ExifTool keeps a{' '}
                  <code className="text-xs bg-gray-800 px-1 rounded">_original</code> backup.
                </p>
              </div>
            </label>
          </div>

          {mergeOptions.mode === 'copy' && (
            <div className="mt-4">
              <button
                onClick={handleSelectOutput}
                className="px-4 py-2 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 text-sm transition-colors"
              >
                {mergeOptions.outputPath ? 'Change output folder' : 'Select output folder'}
              </button>
              {mergeOptions.outputPath && (
                <p className="mt-2 text-xs text-gray-400 font-mono">{mergeOptions.outputPath}</p>
              )}
            </div>
          )}
        </section>

        {/* Field toggles */}
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Fields to Write
          </h3>
          <div className="space-y-2">
            {(
              [
                ['dateTime', 'Date & Time'],
                ['gps', 'GPS Location'],
                ['description', 'Description'],
                ['people', 'People Tags'],
                ['title', 'Title']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fields[key]}
                  onChange={(e) =>
                    setMergeOptions({ fields: { ...fields, [key]: e.target.checked } })
                  }
                  className="accent-brand-500"
                />
                <span className="text-gray-200">{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Progress */}
        {isMerging && progress && (
          <section className="mb-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{progress.currentFile || 'Processing...'}</span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all"
                style={{
                  width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%'
                }}
              />
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
        <button
          onClick={() => setStep(2)}
          disabled={isMerging}
          className="px-4 py-2 text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        {isMerging ? (
          <button
            onClick={handleCancel}
            className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleStartMerge}
            disabled={
              selectedPairs.length === 0 ||
              (mergeOptions.mode === 'copy' && !mergeOptions.outputPath)
            }
            className="px-6 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            Start Merge ({selectedPairs.length} files)
          </button>
        )}
      </div>
    </div>
  )
}
