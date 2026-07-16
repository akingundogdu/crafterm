import { Component } from '@geajs/core'
import './agent-composer.css'
import ProjectSelect from '@views/components/project-select/project-select'
import { focusWhenReady } from '@views/lib/focus'
import store, {
  MODES,
  COMPOSER_PLACEHOLDER,
  COMPOSER_HINT,
  PICK_HINT,
  PLAN_LABEL,
  BUILD_LABEL,
  LAPTOP_SVG,
  TERMINAL_SVG,
  SPOTLIGHT_SVG,
  openNewTerminal,
  openSpotlight,
  setDraft,
  seedDraftInto
} from './agent-composer.store'
import type { ComposerMode, SlashItem } from './agent-composer.types'

// The agent composer (Cursor-style start screen): project · base branch · run mode
// above a prompt box, with New Terminal / Open Project below it. What's typed becomes
// a Daily Plan ticket and a Claude terminal. Shown whenever no tab is selected.
//
// The textarea is UNCONTROLLED and its text is kept in the store's non-reactive draft
// (updated on every keystroke). gea does fine-grained updates — a dropdown change patches
// only its own node and leaves the textarea in place — and onAfterRender is mount-only,
// so it seeds the draft on the FIRST render only. On a later show the same textarea node
// survives with its stale value, so focusAgentComposer re-seeds it from the draft (empty
// after a submit). The icon SVGs are injected through refs in onAfterRender — an
// `innerHTML=` JSX prop is dropped by gea.
class AgentComposer extends Component {
  inputEl: HTMLTextAreaElement | null = null
  modeIconEl: HTMLSpanElement | null = null
  terminalIconEl: HTMLSpanElement | null = null
  spotlightIconEl: HTMLSpanElement | null = null

  onAfterRender(): void {
    if (this.modeIconEl) this.modeIconEl.innerHTML = LAPTOP_SVG
    if (this.terminalIconEl) this.terminalIconEl.innerHTML = TERMINAL_SVG
    if (this.spotlightIconEl) this.spotlightIconEl.innerHTML = SPOTLIGHT_SVG
    const input = this.inputEl
    if (!input) return
    seedDraftInto(input)
    input.focus()
    this.autoGrow(input)
  }

  private autoGrow = (input: HTMLTextAreaElement): void => sizeComposerInput(input)

  private onInput = (e: Event): void => {
    const input = e.target as HTMLTextAreaElement
    const caret = input.selectionStart ?? input.value.length
    setDraft(input.value, caret)
    store.syncSlash(input.value, caret)
    this.autoGrow(input)
  }

  // Moving the caret out of a "/token" (click, arrow keys) closes the menu.
  private onSelectionChange = (e: Event): void => {
    const input = e.target as HTMLTextAreaElement
    const caret = input.selectionStart ?? input.value.length
    setDraft(input.value, caret)
    store.syncSlash(input.value, caret)
  }

  private applyItem = (item: SlashItem): void => {
    const input = this.inputEl
    if (!input) return
    const next = store.applySlash(item, input.value, input.selectionStart ?? input.value.length)
    input.value = next.text
    input.setSelectionRange(next.caret, next.caret)
    input.focus()
    this.autoGrow(input)
  }

  // Cmd+Enter submits; Enter is a plain newline (the box is a normal textarea). While
  // the "/" menu is open it takes the arrows, Enter/Tab (pick) and Escape (close).
  // Keys are swallowed so the app's global bindings don't fire while typing a ticket.
  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (store.isSlashOpen && !e.metaKey) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        store.moveSlash(e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const item = store.activeSlashItem
        if (item) {
          e.preventDefault()
          this.applyItem(item)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        store.closeSlash()
        return
      }
    }
    if (e.key !== 'Enter' || !e.metaKey) return
    e.preventDefault()
    void store.submit((e.target as HTMLTextAreaElement).value)
  }

  template() {
    const branches = store.branches
    const mode = store.mode
    const isPlanMode = store.isPlanMode
    return (
      <div class="agent-composer" data-rev={String(store.rev)}>
        <div class="agent-composer-context">
          <ProjectSelect
            value={store.projectId ?? ''}
            selectClass="agent-composer-select"
            showPathHint={false}
            onChange={(id: string) => void store.setProject(id)}
          />
          <select
            class="agent-composer-select"
            disabled={!branches.length}
            onChange={(e: Event) => store.setBaseBranch((e.target as HTMLSelectElement).value)}
          >
            {branches.map((b) => (
              <option key={b} value={b} selected={b === store.baseBranch}>
                {b}
              </option>
            ))}
          </select>
          <span class="agent-composer-mode">
            <span class="agent-composer-mode-icon" ref={this.modeIconEl} />
            <select
              class="agent-composer-select"
              onChange={(e: Event) => store.setMode((e.target as HTMLSelectElement).value as ComposerMode)}
            >
              {MODES.map((m) => (
                <option key={m.val} value={m.val} selected={m.val === mode}>
                  {m.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div class="agent-composer-box">
          {store.isSlashOpen ? (
            <div class="agent-composer-slash">
              {store.slashItems.map((item, i) => (
                <div
                  key={item.id}
                  class={'agent-composer-slash-row' + (i === store.slashIndex ? ' active' : '')}
                  onMouseDown={(e: MouseEvent) => {
                    e.preventDefault()
                    this.applyItem(item)
                  }}
                >
                  <span class="agent-composer-slash-label">{'/' + item.label}</span>
                  <span class="agent-composer-slash-detail">{item.detail}</span>
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            class="agent-composer-input"
            rows={2}
            placeholder={COMPOSER_PLACEHOLDER}
            ref={this.inputEl}
            onInput={this.onInput}
            onKeyDown={this.onKeyDown}
            onKeyUp={this.onSelectionChange}
            onClick={this.onSelectionChange}
          />
          <div class="agent-composer-toolbar">
            <div class="agent-composer-toggle">
              <button
                class={'agent-composer-toggle-btn' + (isPlanMode ? '' : ' active')}
                onClick={() => store.setPlanMode(false)}
              >
                {BUILD_LABEL}
              </button>
              <button
                class={'agent-composer-toggle-btn' + (isPlanMode ? ' active' : '')}
                onClick={() => store.setPlanMode(true)}
              >
                {PLAN_LABEL}
              </button>
            </div>
            <span class="agent-composer-hint">{COMPOSER_HINT}</span>
          </div>
        </div>

        <div class="agent-composer-actions">
          <button class="agent-composer-action" onClick={openNewTerminal}>
            <span class="agent-composer-action-icon" ref={this.terminalIconEl} />
            New Terminal
          </button>
          <button class="agent-composer-action" onClick={openSpotlight}>
            <span class="agent-composer-action-icon" ref={this.spotlightIconEl} />
            Open Project
          </button>
        </div>
        <div class="agent-composer-pick-hint">{PICK_HINT}</div>
      </div>
    )
  }
}

// The host is returned (not the rendered root): gea fills it on its own render tick,
// so reading `firstElementChild` right after `render()` would come back null.
// Rendering waits for the first refresh so the dropdowns are built from a loaded
// sidebar tree + branch list, not from an empty one.
export function buildAgentComposer(): HTMLElement {
  const host = document.createElement('div')
  host.className = 'agent-composer-screen'
  void store.refresh().then(() => {
    new AgentComposer().render(host)
    focusAgentComposer()
  })
  return host
}

// Re-read the projects whenever the start screen is shown again (one may have been
// added, or its branches changed, since it was built) and put the caret back in the
// prompt box, so the start screen is always ready to be typed into.
export function refreshAgentComposer(): void {
  void store.refresh()
  focusAgentComposer()
}

// Size the textarea to its content: reset to `auto` so scrollHeight reflects the real
// text height, then pin that height. CSS `max-height` caps the growth and scrolls the
// overflow, so the box expands downward until the limit.
function sizeComposerInput(input: HTMLTextAreaElement): void {
  input.style.height = 'auto'
  input.style.height = `${input.scrollHeight}px`
}

// The composer is built once and then shown/hidden, so its mount-only onAfterRender
// cannot re-seed it on a later visit — and on the very first render the element does
// not exist yet (gea renders async). Wait for the textarea, resync it to the draft
// (empty after a submit, so the prompt does not linger), size it, then focus it.
function focusAgentComposer(): void {
  focusWhenReady(() => {
    const input = document.querySelector<HTMLTextAreaElement>('.agent-composer-input')
    if (!input) return null
    seedDraftInto(input)
    sizeComposerInput(input)
    return input
  })
}
