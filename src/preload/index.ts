import { contextBridge, ipcRenderer } from 'electron'
import type { MatchedPair, MergeOptions, ParsedMetadata, ProgressEvent } from '../shared/types'

const MEDIA_FILTERS = [
  {
    name: 'Media Files',
    extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tiff', 'tif', 'webp', 'gif', 'mov', 'mp4', 'avi', 'mkv', 'm4v', '3gp']
  }
]

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),

  selectFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFile', filters ?? MEDIA_FILTERS),

  scanFolder: (path: string) => ipcRenderer.invoke('scan:folder', path),

  parseMetadata: (jsonPath: string): Promise<ParsedMetadata> =>
    ipcRenderer.invoke('metadata:parse', jsonPath),

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
