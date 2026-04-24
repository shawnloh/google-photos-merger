import { useAppStore } from './store/appStore'
import FolderPicker from './components/FolderPicker'
import ScanResults from './components/ScanResults'
import MergeConfig from './components/MergeConfig'
import ResultsReport from './components/ResultsReport'

const STEPS = ['Select Folder', 'Scan & Preview', 'Configure & Merge', 'Results'] as const

export default function App(): JSX.Element {
  const step = useAppStore((s) => s.step)

  return (
    <div className="flex flex-col h-full">
      {/* Title bar drag region */}
      <div className="h-8 [-webkit-app-region:drag] bg-gray-950 flex-shrink-0" />

      {/* Step indicator */}
      <nav className="flex items-center justify-center gap-2 py-4 px-6 border-b border-gray-800">
        {STEPS.map((label, i) => {
          const idx = i + 1
          const isActive = step === idx
          const isDone = step > idx
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white'
                    : isDone
                      ? 'bg-brand-700 text-white'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {idx}
              </div>
              <span
                className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-700 mx-1" />}
            </div>
          )
        })}
      </nav>

      {/* Step content */}
      <main className="flex-1 overflow-auto">
        {step === 1 && <FolderPicker />}
        {step === 2 && <ScanResults />}
        {step === 3 && <MergeConfig />}
        {step === 4 && <ResultsReport />}
      </main>
    </div>
  )
}
