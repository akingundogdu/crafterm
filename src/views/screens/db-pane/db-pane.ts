import { el } from '@views/lib/dom'
import { paneActions, uid } from '@views/state/spine'
import { UITexts } from '@texts'
import { setupPaneDnd } from '@views/pane/pane'
import { createQueryToolbar } from './components/query-toolbar'
import './db-pane.css'
import { DbPaneController, type DbPaneOptions } from './db-pane.controller'

export type { DbPaneOptions } from './db-pane.controller'
export type { ParsedSelect } from './db-pane.types'
export { destroySqlPane } from './db-pane.state'

// SQL query pane: the workbench (toolbar + editor + result grid) shown as a
// first-class pane (split next to the active pane), replacing the old modal.
// This factory builds the static skeleton DOM and hands it to a
// DbPaneController, which owns all per-pane state and behavior. Plain-DOM (el())
// port of the legacy JSX factory — the db-pane is an imperative widget (§2.7
// self-contained, no @ui).
export function createSqlPane(opts: DbPaneOptions): string {
  const id = uid('sq')

  // header
  const htitle = el('span', { class: 'pane-title' }, UITexts.DbPane.sql)
  const close = el(
    'button',
    {
      class: 'pane-close',
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        paneActions.close(id)
      }
    },
    '×'
  )
  const header = el('div', { class: 'pane-header' }, htitle, close)

  // toolbar
  const { bar, dot, connSel, runBtn, saveBtn, themeSel } = createQueryToolbar()

  // editor host
  const editorHost = el('div', { class: 'db-query-editor' })

  // result
  const result = el('div', {
    class: 'db-result',
    innerHTML: `<div class="db-result-empty">${UITexts.DbPane.runToSeeResults}</div>`
  })

  // body
  const body = el('div', { class: 'sql-pane-body' }, bar, editorHost, result)

  const box = el(
    'div',
    {
      class: 'pane-box sql-pane',
      onMouseDown: () => paneActions.select(id)
    },
    header,
    body
  )
  box.dataset.paneId = id

  setupPaneDnd(box, header, id)

  new DbPaneController(id, { el: box, htitle, dot, connSel, runBtn, saveBtn, themeSel, editorHost, result }, opts)

  return id
}
