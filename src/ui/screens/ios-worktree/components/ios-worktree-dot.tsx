import { dotInfo } from '../ios-worktree.state'

export function createIosWorktreeDot(worktreePath: string): HTMLElement {
  const st = dotInfo(worktreePath)
  return (<span class={`ios-wt-dot ios-wt-dot-${st.cls}`} title={st.title} />) as HTMLSpanElement
}
