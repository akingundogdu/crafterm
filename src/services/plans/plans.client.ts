import { call, listen } from '../channels.client'

// Plans IPC (~/.claude/plans + project docs/plans scan + live watch).
export const plansService = {
  list: () => call('plans:list'),
  forBranch: (cwd: string, branch: string) => call('plans:forBranch', { cwd, branch }),
  scan: (paths: string[]) => call('plans:scan', { paths }),
  onChanged: (cb: (plansDir: string) => void) => listen('plans:changed', (p) => cb(p.plansDir))
}
