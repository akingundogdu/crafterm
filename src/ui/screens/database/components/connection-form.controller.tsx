import { uid } from '@ui/state/state'
import type { DbConnNode, DbConnection, DbEngine } from '@ui/types/types'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createOverlay } from '@ui/components'
import { dbService } from '@services'
import { UITexts } from '@texts'
import { engineClass } from '../database.state'

export interface ConnectionFormOptions {
  existing?: DbConnNode
  onSave: (conn: DbConnection) => void
}

// Connection form modal: engine segmented control + network/sqlite fields +
// test/save buttons. The connection model is built here from the inputs, but
// IPC (test) is delegated and persistence/tree mutation happens in the onSave
// callback supplied by database.tsx.
export class ConnectionFormController {
  private readonly existing?: DbConnNode
  private readonly onSave: (conn: DbConnection) => void
  private readonly c?: DbConnection

  private engineVal: DbEngine
  private readonly segBtns: HTMLButtonElement[] = []

  private readonly name: HTMLInputElement
  private readonly netWrap: HTMLDivElement
  private readonly host: HTMLInputElement
  private readonly port: HTMLInputElement
  private readonly user: HTMLInputElement
  private readonly pass: HTMLInputElement
  private readonly database: HTMLInputElement
  private readonly ssl: HTMLInputElement
  private readonly file: HTMLInputElement
  private readonly fileWrap: HTMLDivElement
  private readonly status: HTMLDivElement

  private readonly close: () => void

  constructor(opts: ConnectionFormOptions) {
    this.existing = opts.existing
    this.onSave = opts.onSave
    const { overlay, mount, close } = createOverlay()
    this.close = close

    const c = (this.c = this.existing?.conn)

    // Engine segmented control: static buttons, imperative active-state + handlers.
    this.engineVal = c?.engine ?? 'postgres'
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
              class={'database-engine-button ' + engineClass(v) + (v === this.engineVal ? ' active' : '')}
              onClick={this.pickEngine(v)}
            >
              {lbl}
            </button>
          ) as HTMLButtonElement
          this.segBtns.push(b)
          return b
        })}
      </div>
    ) as HTMLDivElement

    this.name = (<input class="reminder-input" type="text" placeholder={UITexts.Database.ph.name} />) as HTMLInputElement
    this.name.value = c?.name ?? ''

    // network fields (postgres/mysql)
    this.ssl = (<input type="checkbox" />) as HTMLInputElement
    this.ssl.checked = !!c?.ssl
    this.netWrap = (<div />) as HTMLDivElement
    this.host = this.mkNet(UITexts.Database.fields.host, c?.host ?? '', UITexts.Database.ph.host)
    this.port = this.mkNet(
      UITexts.Database.fields.port,
      c?.port ? String(c.port) : '',
      UITexts.Database.ph.port,
      'number'
    )
    this.user = this.mkNet(UITexts.Database.fields.user, c?.user ?? '', UITexts.Database.ph.user)
    this.pass = this.mkNet(UITexts.Database.fields.password, c?.password ?? '', UITexts.Database.ph.password, 'password')
    this.database = this.mkNet(UITexts.Database.fields.database, c?.database ?? '', UITexts.Database.ph.database)
    this.netWrap.appendChild(
      (
        <label class="checkbox-row">
          {this.ssl}
          Use SSL
        </label>
      ) as HTMLLabelElement
    )

    // sqlite field
    this.file = (<input class="reminder-input" placeholder={UITexts.Database.ph.file} />) as HTMLInputElement
    this.file.value = c?.file ?? ''
    this.fileWrap = (
      <div>
        <div class="reminder-label">SQLite file</div>
        {this.file}
      </div>
    ) as HTMLDivElement

    this.status = (<div class="db-conn-status" />) as HTMLDivElement

    const actions = (
      <div class="modal-actions">
        <button onClick={this.onTestConn}>Test</button>
        <button class="button-primary" onClick={this.onSaveConn}>
          {this.existing ? UITexts.Database.save : UITexts.Database.add}
        </button>
      </div>
    ) as HTMLDivElement

    const modal = (
      <div class="modal db-conn-modal">
        {makeCloseButton(this.close)}
        <h2>{this.existing ? UITexts.Database.editHeading : UITexts.Database.newHeading}</h2>
        <div class="reminder-label">Engine</div>
        {seg}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    // Name field + the rest, appended after the engine segment (preserving order).
    modal.append(
      (<div class="reminder-label">Name</div>) as HTMLDivElement,
      this.name,
      this.netWrap,
      this.fileWrap,
      this.status,
      actions
    )

    this.applyEngine()
    mount()
    this.name.focus()
  }

  private pickEngine = (v: DbEngine) => (): void => {
    this.engineVal = v
    this.segBtns.forEach((x) => x.classList.toggle('active', x.dataset.engine === v))
    this.applyEngine()
  }

  private mkNet = (label: string, value: string, ph: string, type = 'text'): HTMLInputElement => {
    const input = (<input class="reminder-input" type={type} placeholder={ph} />) as HTMLInputElement
    input.value = value
    this.netWrap.append((<div class="reminder-label">{label}</div>) as HTMLDivElement, input)
    return input
  }

  private applyEngine = (): void => {
    const sqlite = this.engineVal === 'sqlite'
    this.netWrap.style.display = sqlite ? 'none' : ''
    this.fileWrap.style.display = sqlite ? '' : 'none'
    this.port.placeholder = this.engineVal === 'mysql' ? '3306' : '5432'
  }

  private build = (): DbConnection => ({
    id: this.c?.id ?? uid('dbc'),
    name: this.name.value.trim() || 'connection',
    engine: this.engineVal,
    host: this.host.value.trim() || undefined,
    port: this.port.value ? parseInt(this.port.value, 10) : undefined,
    user: this.user.value.trim() || undefined,
    password: this.pass.value || undefined,
    database: this.database.value.trim() || undefined,
    ssl: this.ssl.checked || undefined,
    file: this.file.value.trim() || undefined
  })

  private onTestConn = (): void => {
    void (async () => {
      this.status.textContent = UITexts.Database.testing
      this.status.className = 'db-conn-status'
      const r = await dbService.connect(this.build())
      this.status.textContent = r.ok ? UITexts.Database.connected : UITexts.Database.failed(r.error)
      this.status.className = 'db-conn-status ' + (r.ok ? 'ok' : 'err')
    })()
  }

  private onSaveConn = (): void => {
    this.onSave(this.build())
    this.close()
  }
}
