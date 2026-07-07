import { Component } from '@geajs/core'
import { paneActions, uid } from '@views/state/spine'
import { UITexts } from '@texts'
import { setupPaneDnd } from '@views/pane/pane'
import { createQueryToolbar } from './components/query-toolbar'
import './db-pane.css'
import { DbPaneController, type DbPaneOptions } from './db-pane.controller'

export type { DbPaneOptions } from './db-pane.controller'
export type { ParsedSelect } from './db-pane.types'
export { destroySqlPane } from './db-pane.state'

// The pane-box shell for a SQL pane. A thin gea shell that owns the
// `.pane-box.sql-pane` box (single fresh mount → extract, mirroring
// code-pane/file-pane); the header + body are pre-built nodes appended
// imperatively (embedding a pre-built node via a `{expr}` JSX child renders an
// empty comment under gea).
class SqlPaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: () => void

  constructor(opts: { id: string; onSelect: () => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return <div class="pane-box sql-pane" data-pane-id={this.paneId} onMouseDown={this.onSelect} />
  }
}

// SQL query pane: the workbench (toolbar + editor + result grid) shown as a
// first-class pane (split next to the active pane), replacing the old modal.
// This factory builds the static skeleton DOM and hands it to a
// DbPaneController, which owns all per-pane state and behavior. The db-pane is
// an imperative widget (§2.7 self-contained, no @ui): the box is a gea shell,
// the header/body are built with plain DOM.
export function createSqlPane(opts: DbPaneOptions): string {
  const id = uid('sq')

  // header
  const htitle = document.createElement('span')
  htitle.className = 'pane-title'
  htitle.textContent = UITexts.DbPane.sql
  const close = document.createElement('button')
  close.className = 'pane-close'
  close.textContent = '×'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  const header = document.createElement('div')
  header.className = 'pane-header'
  header.append(htitle, close)

  // toolbar
  const { bar, dot, connSel, runBtn, saveBtn, themeSel } = createQueryToolbar()

  // editor host
  const editorHost = document.createElement('div')
  editorHost.className = 'db-query-editor'

  // result
  const result = document.createElement('div')
  result.className = 'db-result'
  result.innerHTML = `<div class="db-result-empty">${UITexts.DbPane.runToSeeResults}</div>`

  // body
  const body = document.createElement('div')
  body.className = 'sql-pane-body'
  body.append(bar, editorHost, result)

  const boxHost = document.createElement('div')
  new SqlPaneBox({ id, onSelect: () => paneActions.select(id) }).render(boxHost)
  const box = boxHost.firstElementChild as HTMLDivElement
  box.append(header, body)

  setupPaneDnd(box, header, id)

  new DbPaneController(id, { el: box, htitle, dot, connSel, runBtn, saveBtn, themeSel, editorHost, result }, opts)

  return id
}
