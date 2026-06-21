import { uid } from '@ui/state/state'
import type { DbConnNode, DbConnection, DbEngine } from '@ui/types/types'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createOverlay } from '@ui/components'
import { dbService } from '@services'
import { UITexts } from '@texts'
import { engineClass } from '../database.state'

// Connection form modal: engine segmented control + network/sqlite fields +
// test/save buttons. Pure factory — the connection model is built here from the
// inputs, but IPC (test) is delegated and persistence/tree mutation happens in
// the onSave callback supplied by database.tsx.
export function buildConnectionForm(opts: {
  existing?: DbConnNode
  onSave: (conn: DbConnection) => void
}): void {
  const { existing, onSave } = opts
  const { overlay, mount, close } = createOverlay()

  const c = existing?.conn

  // Engine segmented control: static buttons, imperative active-state + handlers.
  let engineVal: DbEngine = c?.engine ?? 'postgres'
  const segBtns: HTMLButtonElement[] = []
  const pickEngine = (v: DbEngine) => (): void => {
    engineVal = v
    segBtns.forEach((x) => x.classList.toggle('active', x.dataset.engine === v))
    applyEngine()
  }
  const seg = (
    <div class="database-engine-selector">
      {(
        [
          ['postgres', UITexts.Database.engines.postgres],
          ['mysql', UITexts.Database.engines.mysql],
          ['sqlite', 'SQLite']
        ] as [DbEngine, string][]
      ).map(([v, lbl]) => {
        const b = (
          <button
            type="button"
            dataset={{ engine: v }}
            class={'database-engine-button ' + engineClass(v) + (v === engineVal ? ' active' : '')}
            onClick={pickEngine(v)}
          >
            {lbl}
          </button>
        ) as HTMLButtonElement
        segBtns.push(b)
        return b
      })}
    </div>
  ) as HTMLDivElement

  const name = (<input class="reminder-input" type="text" placeholder={UITexts.Database.ph.name} />) as HTMLInputElement
  name.value = c?.name ?? ''

  // network fields (postgres/mysql)
  const mkNet = (label: string, value: string, ph: string, type = 'text'): HTMLInputElement => {
    const input = (<input class="reminder-input" type={type} placeholder={ph} />) as HTMLInputElement
    input.value = value
    netWrap.append((<div class="reminder-label">{label}</div>) as HTMLDivElement, input)
    return input
  }
  const ssl = (<input type="checkbox" />) as HTMLInputElement
  ssl.checked = !!c?.ssl
  const netWrap = (<div />) as HTMLDivElement
  const host = mkNet(UITexts.Database.fields.host, c?.host ?? '', UITexts.Database.ph.host)
  const port = mkNet(UITexts.Database.fields.port, c?.port ? String(c.port) : '', UITexts.Database.ph.port, 'number')
  const user = mkNet(UITexts.Database.fields.user, c?.user ?? '', UITexts.Database.ph.user)
  const pass = mkNet(UITexts.Database.fields.password, c?.password ?? '', UITexts.Database.ph.password, 'password')
  const database = mkNet(UITexts.Database.fields.database, c?.database ?? '', UITexts.Database.ph.database)
  netWrap.appendChild(
    (
      <label class="checkbox-row">
        {ssl}
        Use SSL
      </label>
    ) as HTMLLabelElement
  )

  // sqlite field
  const file = (<input class="reminder-input" placeholder={UITexts.Database.ph.file} />) as HTMLInputElement
  file.value = c?.file ?? ''
  const fileWrap = (
    <div>
      <div class="reminder-label">SQLite file</div>
      {file}
    </div>
  ) as HTMLDivElement

  const applyEngine = (): void => {
    const sqlite = engineVal === 'sqlite'
    netWrap.style.display = sqlite ? 'none' : ''
    fileWrap.style.display = sqlite ? '' : 'none'
    port.placeholder = engineVal === 'mysql' ? '3306' : '5432'
  }

  const status = (<div class="db-conn-status" />) as HTMLDivElement

  const build = (): DbConnection => ({
    id: c?.id ?? uid('dbc'),
    name: name.value.trim() || 'connection',
    engine: engineVal,
    host: host.value.trim() || undefined,
    port: port.value ? parseInt(port.value, 10) : undefined,
    user: user.value.trim() || undefined,
    password: pass.value || undefined,
    database: database.value.trim() || undefined,
    ssl: ssl.checked || undefined,
    file: file.value.trim() || undefined
  })

  const onTestConn = (): void => {
    void (async () => {
      status.textContent = UITexts.Database.testing
      status.className = 'db-conn-status'
      const r = await dbService.connect(build())
      status.textContent = r.ok ? UITexts.Database.connected : UITexts.Database.failed(r.error)
      status.className = 'db-conn-status ' + (r.ok ? 'ok' : 'err')
    })()
  }

  const onSaveConn = (): void => {
    onSave(build())
    close()
  }

  const actions = (
    <div class="modal-actions">
      <button onClick={onTestConn}>Test</button>
      <button class="button-primary" onClick={onSaveConn}>
        {existing ? UITexts.Database.save : UITexts.Database.add}
      </button>
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class="modal db-conn-modal">
      {makeCloseButton(close)}
      <h2>{existing ? UITexts.Database.editHeading : UITexts.Database.newHeading}</h2>
      <div class="reminder-label">Engine</div>
      {seg}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  // Name field + the rest, appended after the engine segment (preserving order).
  modal.append((<div class="reminder-label">Name</div>) as HTMLDivElement, name, netWrap, fileWrap, status, actions)

  applyEngine()
  mount()
  name.focus()
}
