import { call, listen, Channel } from '../channels.client'

// Plans IPC (~/.claude/plans + project docs/plans scan + live watch).
export const plansService = {
  list: () => call(Channel.Plans.List),
  forBranch: (cwd: string, branch: string) => call(Channel.Plans.ForBranch, { cwd, branch }),
  scan: (paths: string[]) => call(Channel.Plans.Scan, { paths }),
  onChanged: (cb: (plansDir: string) => void) => listen(Channel.Plans.Changed, (p) => cb(p.plansDir))
}
