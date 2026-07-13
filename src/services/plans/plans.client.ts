import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Plans IPC (~/.claude/plans + project docs/plans scan + live watch).
class PlansClient extends BaseClient {
  list = () => this.call(Channel.Plans.List)
  forBranch = (cwd: string, branch: string) => this.call(Channel.Plans.ForBranch, { cwd, branch })
  scan = (paths: string[]) => this.call(Channel.Plans.Scan, { paths })
  onChanged = (cb: (plansDir: string) => void) =>
    this.listen(Channel.Plans.Changed, (p) => cb(p.plansDir))
}

export const plansService = new PlansClient()
