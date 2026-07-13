import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterResumeSessions, type ResumeSession } from '../claude.store'
import store from '../claude-resume.store'
import ResumeSessionRow from './resume-session-row'

// The chrome + behaviour the resume view needs, supplied by the controller that
// mounts it. The handlers close over the controller's async load, keyboard nav, and
// resume/close state.
export interface ClaudeResumeDeps {
  placeholder: string
  onSelect: (session: ResumeSession) => void
  onHover: (index: number) => void
  onKeyDown: (e: KeyboardEvent) => void
}

// Reactive body of the resume-session picker: heading, search box (with keyboard
// nav delegated to the controller), and the live-filtered session list. Rendered as
// a JSX child of ClaudeResumeView so gea tracks its store reads and re-renders it on
// every keystroke, load, and selection change (arrow-key nav / hover) — the board
// pattern.
class ClaudeResumeList extends Component {
  declare props: { deps: ClaudeResumeDeps }

  template({ deps }: this['props']) {
    // Read the reactive store fields (the history list, the search, and the
    // selection index) so this child re-renders on any keystroke, load, or hover /
    // arrow-key selection change.
    const all = store.sessions
    const items = filterResumeSessions(all, store.search)
    const sel = store.sel

    return (
      <div class="claude-resume-picker">
        <h2>{UITexts.Pickers.claude.resumeHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={deps.placeholder}
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.slice(0, 400).map((s, i) => (
            <ResumeSessionRow
              key={s.id}
              session={s}
              isActive={i === sel}
              onSelect={() => deps.onSelect(s)}
              onHover={() => deps.onHover(i)}
            />
          ))}
          {items.length === 0 && (
            <div class="empty-hint">
              {all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.claude.noSessions}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the resume picker, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The reactive markup lives in the ClaudeResumeList JSX child.
export default class ClaudeResumeView extends Component {
  private readonly deps: ClaudeResumeDeps

  constructor(deps: ClaudeResumeDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <ClaudeResumeList deps={this.deps} />
  }
}
