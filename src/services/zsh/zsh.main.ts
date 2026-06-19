import { ipcMain } from 'electron'
import { execFile } from 'child_process'

// Zsh bridge (zsh:*): list the user's aliases + functions for the palette.
export function registerZshIpc(): void {
  // List the user's zsh-defined commands (aliases + functions) for the palette.
  ipcMain.handle('zsh:commands', async () => {
    const out = await new Promise<string>((resolve) => {
      execFile(
        '/bin/zsh',
        ['-ic', 'alias; echo "@@FUNCS@@"; print -rl -- ${(k)functions}'],
        { timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
        (_err, stdout) => resolve(stdout || '')
      )
    })
    const [aliasPart, funcPart = ''] = out.split('@@FUNCS@@')
    const cmds: { name: string; value: string }[] = []
    for (const line of aliasPart.split('\n')) {
      const m = line.match(/^([A-Za-z0-9_.-]+)=(.*)$/)
      if (m) cmds.push({ name: m[1], value: m[2].replace(/^'(.*)'$/, '$1') })
    }
    for (const line of funcPart.split('\n')) {
      const n = line.trim()
      if (n && !n.startsWith('_') && /^[A-Za-z0-9_.-]+$/.test(n)) cmds.push({ name: n, value: '' })
    }
    const seen = new Set<string>()
    return cmds
      .filter((c) => (seen.has(c.name) ? false : seen.add(c.name)))
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}
