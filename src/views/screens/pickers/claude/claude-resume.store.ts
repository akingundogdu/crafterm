import { Store } from '@geajs/core'
import type { ResumeSession } from './claude.state'

// Reactive state for the resume-session picker. `sessions` (the ~/.claude history),
// `search`, and `sel` (keyboard/hover selection index) are read directly in the
// resume view's template(), so gea re-renders it on every keystroke, load, and
// selection change — the daily-plan.store pattern (no dead `void store.rev`; every
// value the template renders is a real reactive field it reads).
class ClaudeResumeStore extends Store {
  sessions: ResumeSession[] = []
  search = ''
  sel = 0

  setSessions(sessions: ResumeSession[]): void {
    this.sessions = sessions
    this.search = ''
    this.sel = 0
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }
}

export default new ClaudeResumeStore()
