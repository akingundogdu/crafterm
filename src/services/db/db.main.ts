import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { runQuery, listObjects, listColumns, disconnect } from '@core/db/db'

// Database IPC adapter (db:*): validate connections, introspect objects/columns,
// run SQL. The drivers + connection pools live in the @core/db model; these thin
// handlers just delegate (no domain logic to extract). Saved .sql queries are a
// separate domain (dbq:*).
export class DbController extends BaseService {
  readonly name = 'db'

  register(): void {
    // Validate a connection by running a trivial query; returns { error } on failure.
    this.handle(Channel.Db.Connect, async ({ config }) => {
      await disconnect(config.id) // re-create with the latest config
      const probe = config.engine === 'sqlite' ? 'select 1' : 'select 1'
      const res = await runQuery(config, probe)
      return { ok: !res.error, error: res.error }
    })
    this.handle(Channel.Db.Objects, ({ config }) => listObjects(config))
    this.handle(Channel.Db.Columns, ({ config, table }) => listColumns(config, table))
    this.handle(Channel.Db.Query, ({ config, sql }) => runQuery(config, sql))
    this.handle(Channel.Db.Disconnect, async ({ id }) => {
      await disconnect(id)
      return true
    })
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
