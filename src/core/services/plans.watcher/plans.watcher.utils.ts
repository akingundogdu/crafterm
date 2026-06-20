import { BrowserWindow } from 'electron'
import { emit, Channel } from '@services/channels.main'

export function broadcast(plansDir: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      emit(win.webContents, Channel.Plans.Changed, { plansDir })
    }
  }
}
