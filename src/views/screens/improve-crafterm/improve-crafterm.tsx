import '@views/screens/improve-crafterm/improve-crafterm.css'
import { Component } from '@geajs/core'
import { appService } from '@services'
import { promptConfirm } from '@views/components/dialog/confirm'
import { splitOrder } from '@views/screens/improve-crafterm/todo-doc'
import type { RowAction } from '@views/screens/improve-crafterm/improve-crafterm.types'
import { makePopoutClick, makeOpenSettingsClick } from '@ui/screens/improve-crafterm/improve-crafterm.state'
import TodoRow from './components/todo-row'
import store, { type EntryView } from './improve-crafterm.store'

// Inline-style helper: a display value when shown, `none` when hidden. Keeps the
// keyed lists permanently mounted (gea fails to materialize a list that first
// appears from the false branch of a conditional) — only their visibility flips.
const show = (on: boolean, display = 'block'): { display: string } => ({ display: on ? display : 'none' })

// Only the active tab's panel carries `.improve-list`; the others stay mounted
// (so their keyed maps materialize when data lands) but drop the class and hide,
// keeping a single `.improve-list` in the DOM.
const listClass = (active: boolean): string => (active ? 'improve-list improve-panel' : 'improve-panel')

// gea port of the Improve Crafterm panel content: progress stats, a new-feature
// form, and the Todo / Ready / Done tabs (plus a stacked search view). The legacy
// modal chrome (overlay, close button, keyboard shortcuts, window-mode) stays in
// the @ui entry, which mounts this component into the modal shell. The root is
// display:contents so head/stats/form/cols/foot lay out as direct flex children
// of `.improve-modal`.
export default class ImprovePanel extends Component {
  ta: HTMLTextAreaElement | null = null

  onAfterRender(): void {
    if (store.formOpen && store.formText === '' && this.ta && document.activeElement !== this.ta) {
      this.ta.focus()
    }
  }

  template() {
    const s = store.stats
    const progEntries = store.progEntries
    const backEntries = store.backEntries
    const readyEntries = store.readyEntries
    const doneItems = store.doneItems
    const todoCount = progEntries.length + backEntries.length
    const splitGroups = progEntries.length > 0 && backEntries.length > 0

    const doneAction = (e: EntryView): RowAction => ({
      icon: '✓',
      title: 'Mark done',
      cls: 'mark-done',
      run: () => store.moveEntry(e.heading, e.idx, 'Done', true)
    })
    const readyActions = (e: EntryView): RowAction[] => [
      { icon: '↩', title: 'Reopen (back to Backlog)', cls: 'reopen', run: () => store.moveEntry(e.heading, e.idx, 'Backlog', false) },
      { icon: '✓', title: 'Approve (mark done)', cls: 'mark-done', run: () => store.moveEntry(e.heading, e.idx, 'Done', true) }
    ]

    // Search view inputs (filtered against the lowercased query). Always computed;
    // the section is hidden via display when the query is empty.
    const q = store.searchQuery
    const matches = (text: string): boolean => q !== '' && text.toLowerCase().includes(q)
    const ftProg = progEntries.filter((e) => matches(e.text))
    const ftBack = backEntries.filter((e) => matches(e.text))
    const ftReady = readyEntries.filter((e) => matches(e.text))
    const ftDone = doneItems.map((text, i) => ({ text, i })).filter((x) => matches(x.text))
    const totalMatches = ftProg.length + ftBack.length + ftReady.length + ftDone.length
    const todoSearchCount = ftProg.length + ftBack.length
    const noFile = store.loaded && !store.hasTodoFile

    return (
      <div class="improve-panel-root" style={{ display: 'contents' }}>
        <div class="improve-head">
          <h2>Improve Crafterm</h2>
          <input
            type="text"
            class="improve-search"
            placeholder="Search Todo / Ready / Done…"
            onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value.trim().toLowerCase())}
            onKeyDown={(e: KeyboardEvent) => {
              e.stopPropagation()
              if (e.key === 'Escape') {
                if (store.searchQuery) {
                  store.setSearch('')
                  ;(e.target as HTMLInputElement).value = ''
                } else {
                  store.close()
                }
              }
            }}
          />
          {!store.windowMode && (
            <button
              class="settings-inline-btn improve-popout-btn"
              title="Open Improve Crafterm in its own window"
              onClick={makePopoutClick(store.close)}
            >
              ⤢ Open in window
            </button>
          )}
          {store.windowMode && (
            <button
              class={'settings-inline-btn improve-ontop-btn' + (store.onTop ? ' active' : '')}
              onClick={() => {
                store.toggleOnTop()
                void appService.improveWindowSetAlwaysOnTop(store.onTop)
              }}
            >
              📌 Always on top
            </button>
          )}
          <button class="settings-inline-btn" disabled={!store.hasTodoFile} onClick={() => store.openForm()}>
            + Request new feature
          </button>
        </div>

        <div class="empty-hint" style={show(noFile)}>
          Set the todo list file in Settings → Workspace first.
        </div>
        <button class="settings-inline-btn" style={show(noFile, 'inline-block')} onClick={makeOpenSettingsClick(store.close)}>
          Open Settings
        </button>

        <div class="improve-stats" style={show(store.hasTodoFile, 'flex')}>
          <div class="improve-stats-counts">
            <span class="improve-stat st-prog">
              <b>{String(s.p)}</b> in progress
            </span>
            <span class="improve-stat st-back">
              <b>{String(s.b)}</b> backlog
            </span>
            <span class="improve-stat st-ready">
              <b>{String(s.r)}</b> ready to test
            </span>
            <span class="improve-stat st-done">
              <b>{String(s.d)}</b> done
            </span>
            <span class="improve-stats-pct">{`${s.pct}% done`}</span>
          </div>
          <div class="improve-progress">
            <div class="improve-progress-fill" style={{ width: s.pct + '%' }} />
          </div>
        </div>

        <div class="improve-form" style={store.formOpen ? { display: 'block' } : { display: 'none' }}>
          <textarea
            class="improve-textarea"
            placeholder="Describe the feature you want…"
            rows={3}
            ref={this.ta}
            value={store.formText}
            onInput={(e: Event) => store.setFormText((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e: KeyboardEvent) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                store.submitFeature()
              }
            }}
          />
          <div class="improve-form-actions">
            <button class="settings-inline-btn" onClick={() => store.submitFeature()}>
              Save
            </button>
            <button class="improve-cancel" onClick={() => store.closeForm()}>
              Cancel
            </button>
          </div>
        </div>

        <div class="improve-cols" style={show(store.hasTodoFile, 'flex')}>
          {/* Tab mode */}
          <div class="improve-tab-mode" style={store.searchQuery ? { display: 'none' } : { display: 'contents' }}>
            <div class="improve-tabs">
              <button
                type="button"
                class={'improve-tab' + (store.activeTab === 'todo' ? ' active' : '')}
                onClick={() => store.setTab('todo')}
              >
                Todo <span class="improve-tab-count">{String(todoCount)}</span>
              </button>
              <button
                type="button"
                class={'improve-tab' + (store.activeTab === 'ready' ? ' active' : '')}
                onClick={() => store.setTab('ready')}
              >
                Ready to test <span class="improve-tab-count">{String(readyEntries.length)}</span>
              </button>
              <button
                type="button"
                class={'improve-tab' + (store.activeTab === 'done' ? ' active' : '')}
                onClick={() => store.setTab('done')}
              >
                Done <span class="improve-tab-count">{String(doneItems.length)}</span>
              </button>
            </div>

            <div
              class="improve-panel-toolbar"
              style={store.activeTab === 'done' && doneItems.length ? { display: 'flex' } : { display: 'none' }}
            >
              <button
                class="improve-clear-done"
                type="button"
                title="Remove all done items from todo-list.md"
                onClick={this.onClearDone}
              >
                Clear all
              </button>
            </div>

            <div class={listClass(store.activeTab === 'todo')} style={show(store.activeTab === 'todo')}>
              {splitGroups && <div class="improve-subhead">🤖 In progress</div>}
              {progEntries.map((e) => (
                <TodoRow key={'p' + e.idx} entry={e} orderNum={e.idx + 1} editable={true} actions={[doneAction(e)]} />
              ))}
              {splitGroups && <div class="improve-subhead">Up next</div>}
              {backEntries.map((e) => (
                <TodoRow
                  key={'b' + e.idx}
                  entry={e}
                  orderNum={e.idx + 1}
                  nextUp={e.idx === 0}
                  editable={true}
                  draggable={true}
                  actions={[doneAction(e)]}
                />
              ))}
              {todoCount === 0 && <div class="empty-hint">Nothing here</div>}
            </div>

            <div class={listClass(store.activeTab === 'ready')} style={show(store.activeTab === 'ready')}>
              {readyEntries.map((e) => (
                <TodoRow key={'r' + e.idx} entry={e} orderNum={e.idx + 1} editable={true} actions={readyActions(e)} />
              ))}
              {readyEntries.length === 0 && <div class="empty-hint">Nothing here</div>}
            </div>

            <div class={listClass(store.activeTab === 'done')} style={show(store.activeTab === 'done')}>
              {doneItems.map((text, i) => (
                <div key={'d' + i} class="improve-item done">
                  <span class="improve-order">{String(i + 1)}</span>
                  <span class="improve-tick">✓</span>
                  <span class="improve-item-text">{splitOrder(text).body}</span>
                </div>
              ))}
              {doneItems.length === 0 && <div class="empty-hint">Nothing here</div>}
            </div>
          </div>

          {/* Search mode */}
          <div class="improve-search-mode" style={store.searchQuery ? { display: 'contents' } : { display: 'none' }}>
            <div class="improve-search-summary">
              {`${totalMatches} match${totalMatches === 1 ? '' : 'es'} for "${store.searchQuery}"`}
            </div>
            <div class="improve-search-section">
              <div class="improve-search-head">{`Todo · ${todoSearchCount}`}</div>
              {todoSearchCount === 0 && <div class="empty-hint">No matches</div>}
              {ftProg.map((e, i) => (
                <TodoRow key={'sp' + e.idx} entry={e} orderNum={i + 1} editable={true} actions={[doneAction(e)]} />
              ))}
              {ftBack.map((e, i) => (
                <TodoRow key={'sb' + e.idx} entry={e} orderNum={i + 1} editable={true} actions={[doneAction(e)]} />
              ))}
            </div>
            <div class="improve-search-section">
              <div class="improve-search-head">{`Ready to test · ${ftReady.length}`}</div>
              {ftReady.length === 0 && <div class="empty-hint">No matches</div>}
              {ftReady.map((e, i) => (
                <TodoRow key={'sr' + e.idx} entry={e} orderNum={i + 1} editable={true} actions={readyActions(e)} />
              ))}
            </div>
            <div class="improve-search-section">
              <div class="improve-search-head">{`Done · ${ftDone.length}`}</div>
              {ftDone.length === 0 && <div class="empty-hint">No matches</div>}
              {ftDone.map((x, i) => (
                <div key={'sd' + x.i} class="improve-item done">
                  <span class="improve-order">{String(i + 1)}</span>
                  <span class="improve-tick">✓</span>
                  <span class="improve-item-text">{splitOrder(x.text).body}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="improve-foot" style={show(store.hasTodoFile, 'flex')}>
          <span class="improve-foot-label">todo file</span>
          <span class="improve-foot-path" title={store.jsonPath}>
            {store.jsonPath}
          </span>
        </div>
      </div>
    )
  }

  private onClearDone = async (): Promise<void> => {
    const count = store.doneItems.length
    const ok = await promptConfirm({
      title: 'Clear done items',
      message: `Remove all ${count} done item(s)? This rewrites todo-list.md.`,
      confirmText: 'Clear all'
    })
    if (ok) store.clearDone()
  }
}
