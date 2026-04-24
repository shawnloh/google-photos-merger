import { contextBridge, ipcRenderer } from 'electron'
import type { MatchedPair, MergeOptions, ProgressEvent } from '../shared/types'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),

  scanFolder: (path: string) => ipcRenderer.invoke('scan:folder', path),

  mergeMetadata: (pairs: MatchedPair[], options: MergeOptions) =>
    ipcRenderer.invoke('merge:start', pairs, options),

  cancelMerge: () => ipcRenderer.invoke('merge:cancel'),

  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),

  onMergeProgress: (callback: (event: ProgressEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: ProgressEvent): void => callback(event)
    ipcRenderer.on('merge:progress', listener)
    return () => ipcRenderer.removeListener('merge:progress', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
