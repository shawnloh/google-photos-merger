import { useState } from 'react'
import { useAppStore } from '../store/appStore'

export default function ResultsReport(): JSX.Element {
  const { mergeResult, mergeOptions, reset } = useAppStore()
  const [showErrors, setShowErrors] = useState(false)

  if (!mergeResult) return <div className="p-8 text-gray-400">No results.</div>

  const { succeeded, failed, skipped, errors } = mergeResult

  async function handleOpenOutput(): Promise<void> {
    if (mergeOptions.outputPath) {
      await window.api.openPath(mergeOptions.outputPath)
    }
  }

  function handleExportReport(): void {
    const lines = [
      'status,filePath,error',
      ...errors.map((e) => `error,"${e.filePath}","${e.error.replace(/"/g, '""')}"`)
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `merge-report-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-8 max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold text-white mb-6">Merge Complete</h2>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{succeeded}</p>
            <p className="text-xs text-green-600 mt-1">Succeeded</p>
          </div>
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{failed}</p>
            <p className="text-xs text-red-600 mt-1">Failed</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-gray-400">{skipped}</p>
            <p className="text-xs text-gray-500 mt-1">Skipped</p>
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <section>
            <button
              onClick={() => setShowErrors((v) => !v)}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 mb-3 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showErrors ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {errors.length} error{errors.length !== 1 ? 's' : ''}
            </button>
            {showErrors && (
              <div className="space-y-2 max-h-64 overflow-auto">
                {errors.map((e, i) => (
                  <div key={i} className="bg-gray-900 border border-red-900 rounded-lg p-3">
                    <p className="text-xs text-gray-400 font-mono break-all">{e.filePath}</p>
                    <p className="text-xs text-red-400 mt-1">{e.error}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between gap-3 p-4 border-t border-gray-800">
        <button
          onClick={reset}
          className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
        >
          Start Over
        </button>
        <div className="flex gap-3">
          {errors.length > 0 && (
            <button
              onClick={handleExportReport}
              className="px-4 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 text-sm rounded-lg transition-colors"
            >
              Export Report
            </button>
          )}
          {mergeOptions.mode === 'copy' && mergeOptions.outputPath && (
            <button
              onClick={handleOpenOutput}
              className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition-colors"
            >
              Open Output Folder
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
