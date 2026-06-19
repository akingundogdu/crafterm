// Repository seam (Phase 2 / §3.12). Entities are accessed only through a
// Repository<T>, so the future JSON -> SQLite migration (§10) is a backend swap
// with no caller changes. `createArrayRepository` is the JSON-backed
// implementation: it operates on a live array (from the loaded state) and calls
// `persist` after mutations, validating rows through the entity schema.

export interface Repository<T extends { id: string }> {
  getAll(): T[]
  get(id: string): T | undefined
  upsert(row: T): void
  remove(id: string): void
  query(pred: (row: T) => boolean): T[]
}

// A minimal Zod-like checker: anything exposing `safeParse`. Avoids a hard
// dependency on zod's types here while still accepting the entity schemas.
interface SafeParser {
  safeParse(row: unknown): { success: boolean; error?: unknown }
}

// Build a non-destructive validator from an entity schema: it checks the row
// and logs on failure, but always returns the ORIGINAL row unchanged (no key
// stripping / coercion), so wiring a schema in never changes persisted data.
// The stricter parse/throw boundary lives at load time (Phase 2 / F).
export function validated<T extends { id: string }>(
  schema: SafeParser,
  label: string
): (row: T) => T {
  return (row) => {
    const r = schema.safeParse(row)
    if (!r.success) console.warn(`[repository] invalid ${label} row`, row, r.error)
    return row
  }
}

export interface ArrayRepositoryOptions<T extends { id: string }> {
  // Validate a row before storing. Should return the row to store (or throw).
  validate?: (row: T) => T
  // Insert new rows at the front (newest-first) instead of appending. Mirrors
  // the `unshift` ordering some lists keep today; SQLite later drives display
  // order via ORDER BY and ignores physical row order.
  prepend?: boolean
}

export function createArrayRepository<T extends { id: string }>(
  getArray: () => T[],
  persist: () => void,
  options: ArrayRepositoryOptions<T> | ((row: T) => T) = {}
): Repository<T> {
  // Back-compat: a bare function is treated as the validator.
  const opts: ArrayRepositoryOptions<T> =
    typeof options === 'function' ? { validate: options } : options
  const { validate, prepend } = opts
  return {
    getAll: () => getArray(),
    get: (id) => getArray().find((r) => r.id === id),
    upsert: (row) => {
      const valid = validate ? validate(row) : row
      const arr = getArray()
      const i = arr.findIndex((r) => r.id === valid.id)
      if (i >= 0) arr[i] = valid
      else if (prepend) arr.unshift(valid)
      else arr.push(valid)
      persist()
    },
    remove: (id) => {
      const arr = getArray()
      const i = arr.findIndex((r) => r.id === id)
      if (i >= 0) {
        arr.splice(i, 1)
        persist()
      }
    },
    query: (pred) => getArray().filter(pred)
  }
}
