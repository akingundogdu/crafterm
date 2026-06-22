import { paneActions, uid } from '@ui/state/state'
import { UITexts } from '@texts'
import { setupPaneDnd } from '@ui/pane/pane'
import { createQueryToolbar } from './components/query-toolbar'
import './db-pane.css'
import { DbPaneController, type DbPaneOptions } from './db-pane.controller'

export type { ParsedSelect } from './db-pane.types'
export { destroySqlPane } from './db-pane.state'

// SQL query pane: the workbench (toolbar + editor + result grid) shown as a
// first-class pane (split next to the active pane), replacing the old modal.
// This factory builds the static skeleton DOM and hands it to a
// DbPaneController, which owns all per-pane state and behavior.
export function createSqlPane(opts: DbPaneOptions): string {
  const id = uid('sq')

  // header
  const htitle = (<span class="pane-title">{UITexts.DbPane.sql}</span>) as HTMLSpanElement
  const close = (
    <button
      class="pane-close"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        paneActions.close(id)
      }}
    >
      ×
    </button>
  ) as HTMLButtonElement
  const header = (
    <div class="pane-header">
      {htitle}
      {close}
    </div>
  ) as HTMLDivElement

  // toolbar
  const { bar, dot, connSel, runBtn, saveBtn, themeSel } = createQueryToolbar()

  // editor host
  const editorHost = (<div class="db-query-editor" />) as HTMLDivElement

  // result
  const result = (
    <div class="db-result" innerHTML={`<div class="db-result-empty">${UITexts.DbPane.runToSeeResults}</div>`} />
  ) as HTMLDivElement

  // body
  const body = (
    <div class="sql-pane-body">
      {bar}
      {editorHost}
      {result}
    </div>
  ) as HTMLDivElement

  const el = (
    <div
      class="pane-box sql-pane"
      dataset={{ paneId: id }}
      onMouseDown={() => paneActions.select(id)}
    >
      {header}
      {body}
    </div>
  ) as HTMLDivElement

  setupPaneDnd(el, header, id)

  new DbPaneController(id, { el, htitle, dot, connSel, runBtn, saveBtn, themeSel, editorHost, result }, opts)

  return id
}
