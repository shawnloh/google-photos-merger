import { useAppStore } from '../store/appStore'

export default function FolderPicker(): JSX.Element {
  const { folderPath, isScanning, setFolderPath, setScanResult, setStep, setIsScanning } =
    useAppStore()

  async function handleSelectFolder(): Promise<void> {
    const path = await window.api.selectFolder()
    if (path) setFolderPath(path)
  }

  async function handleScan(): Promise<void> {
    if (!folderPath) return
    setIsScanning(true)
    try {
      const result = await window.api.scanFolder(folderPath)
      setScanResult(result)
      setStep(2)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Google Photos Merger</h1>
        <p className="text-gray-400">
          Restore metadata from Google Takeout sidecars into your photos and videos
        </p>
      </div>

      <button
        onClick={handleSelectFolder}
        className="w-full max-w-lg h-40 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-brand-500 hover:bg-gray-900 transition-colors cursor-pointer"
      >
        <svg
          className="w-12 h-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
        <span className="text-gray-300 font-medium">Click to select Google Takeout folder</span>
      </button>

      {folderPath && (
        <div className="w-full max-w-lg">
          <p className="text-sm text-gray-400 mb-1">Selected folder:</p>
          <p className="text-sm text-gray-200 bg-gray-800 rounded-lg px-3 py-2 font-mono break-all">
            {folderPath}
          </p>
        </div>
      )}

      <button
        onClick={handleScan}
        disabled={!folderPath || isScanning}
        className="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
      >
        {isScanning ? 'Scanning...' : 'Scan Folder'}
      </button>
    </div>
  )
}
