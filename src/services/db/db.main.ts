import { handle } from '@services/channels.main'
import { runQuery, listObjects, listColumns, disconnect } from '@core/db'

// Database tool bridge (db:*): validate connections, introspect objects/columns,
// run SQL. The drivers + connection pools live in the @core/db model; these thin
// handlers just delegate. Saved .sql queries are a separate domain (dbq:*).
export function registerDbIpc(): void {
  // Validate a connection by running a trivial query; returns { error } on failure.
  handle('db:connect', async ({ config }) => {
    await disconnect(config.id) // re-create with the latest config
    const probe = config.engine === 'sqlite' ? 'select 1' : 'select 1'
    const res = await runQuery(config, probe)
    return { ok: !res.error, error: res.error }
  })

  handle('db:objects', ({ config }) => listObjects(config))

  handle('db:columns', ({ config, table }) => listColumns(config, table))

  handle('db:query', ({ config, sql }) => runQuery(config, sql))

  handle('db:disconnect', async ({ id }) => {
    await disconnect(id)
    return true
  })
}
