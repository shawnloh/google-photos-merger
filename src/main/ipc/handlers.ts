import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { scanFolder } from '../services/scanner'
import { mergeMetadata, requestCancel } from '../services/writer'
import { parseMetadata } from '../services/parser'
import type { MatchedPair, MergeOptions } from '../../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFile', async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('scan:folder', async (_event, folderPath: string) => {
    return scanFolder(folderPath)
  })

  ipcMain.handle('metadata:parse', async (_event, jsonPath: string) => {
    return parseMetadata(jsonPath)
  })

  ipcMain.handle(
    'merge:start',
    async (event, pairs: MatchedPair[], options: MergeOptions) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return mergeMetadata(pairs, options, (progress) => {
        win?.webContents.send('merge:progress', progress)
      })
    }
  )

  ipcMain.handle('merge:cancel', () => {
    requestCancel()
  })

  ipcMain.handle('shell:openPath', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
  })
}
