import { execFile } from 'child_process'
import type { ZshCommand } from './zsh.types'

// Zsh domain logic (zsh:*): list the user's aliases + functions for the palette.
// No IPC wiring (that's ZshController in zsh.main.ts).
export class ZshService {
  // List the user's zsh-defined commands (aliases + functions) for the palette.
  // Hardcoded /bin/zsh on purpose: the command is zsh-specific (`${(k)functions}`,
  // `print -rl`) and would break under bash/fish.
  async commands(): Promise<ZshCommand[]> {
    const out = await new Promise<string>((resolve) => {
      execFile(
        '/bin/zsh',
        ['-ic', 'alias; echo "@@FUNCS@@"; print -rl -- ${(k)functions}'],
        { timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
        (_err, stdout) => resolve(stdout || '')
      )
    })
    const [aliasPart, funcPart = ''] = out.split('@@FUNCS@@')
    const cmds: ZshCommand[] = []
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
  }
}
