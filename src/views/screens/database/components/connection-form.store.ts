import { Store } from '@geajs/core'
import { uid } from '@views/lib/uid'
import { dbService } from '@services'
import { UITexts } from '@texts'
import type { DbConnNode, DbConnection, DbEngine } from '@views/types/types'

// Reactive state + logic for the gea connection add/edit form (merges the legacy
// imperative ConnectionForm). A singleton reset on each open (the improve-crafterm
// pattern): `open()` seeds the fields + the onSave/close callbacks, the component
// reads the reactive fields, `testConnection()` probes via the db service, and
// `save()` builds a fresh DbConnection (a plain object, never a reactive proxy)
// and hands it to the caller's onSave. Self-contained — no @ui (§2.7).
class ConnectionFormStore extends Store {
  engine: DbEngine = 'postgres'
  name = ''
  host = ''
  port = ''
  user = ''
  pass = ''
  database = ''
  ssl = false
  file = ''
  statusText = ''
  statusKind: '' | 'ok' | 'err' = ''
  existing: DbConnNode | undefined = undefined

  private baseId: string | undefined = undefined
  private onSaveFn: (conn: DbConnection) => void = () => {}
  private closeFn: () => void = () => {}

  open(existing: DbConnNode | undefined, onSave: (conn: DbConnection) => void, close: () => void): void {
    const c = existing?.conn
    this.existing = existing
    this.baseId = c?.id
    this.engine = c?.engine ?? 'postgres'
    this.name = c?.name ?? ''
    this.host = c?.host ?? ''
    this.port = c?.port ? String(c.port) : ''
    this.user = c?.user ?? ''
    this.pass = c?.password ?? ''
    this.database = c?.database ?? ''
    this.ssl = !!c?.ssl
    this.file = c?.file ?? ''
    this.statusText = ''
    this.statusKind = ''
    this.onSaveFn = onSave
    this.closeFn = close
  }

  get isSqlite(): boolean {
    return this.engine === 'sqlite'
  }

  get titleText(): string {
    return this.existing ? UITexts.Database.editHeading : UITexts.Database.newHeading
  }

  get saveLabel(): string {
    return this.existing ? UITexts.Database.save : UITexts.Database.add
  }

  // Mirrors the legacy applyEngine: the port hint swaps with the engine.
  get portPlaceholder(): string {
    return this.engine === 'mysql' ? '3306' : '5432'
  }

  get statusClass(): string {
    return this.statusKind ? 'db-conn-status ' + this.statusKind : 'db-conn-status'
  }

  setEngine(v: DbEngine): void {
    this.engine = v
  }

  close(): void {
    this.closeFn()
  }

  // Builds a fresh DbConnection by reading the reactive fields into a plain
  // object literal — the proxy is only ever READ, never assigned to (§5.3).
  private build(): DbConnection {
    return {
      id: this.baseId ?? uid('dbc'),
      name: this.name.trim() || 'connection',
      engine: this.engine,
      host: this.host.trim() || undefined,
      port: this.port ? parseInt(this.port, 10) : undefined,
      user: this.user.trim() || undefined,
      password: this.pass || undefined,
      database: this.database.trim() || undefined,
      ssl: this.ssl || undefined,
      file: this.file.trim() || undefined
    }
  }

  testConnection(): void {
    void (async () => {
      this.statusText = UITexts.Database.testing
      this.statusKind = ''
      const r = await dbService.connect(this.build())
      this.statusText = r.ok ? UITexts.Database.connected : UITexts.Database.failed(r.error)
      this.statusKind = r.ok ? 'ok' : 'err'
    })()
  }

  save(): void {
    this.onSaveFn(this.build())
    this.close()
  }
}

export default new ConnectionFormStore()
