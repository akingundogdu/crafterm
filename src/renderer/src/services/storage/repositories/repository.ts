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

export function createArrayRepository<T extends { id: string }>(
  getArray: () => T[],
  persist: () => void,
  validate?: (row: T) => T
): Repository<T> {
  return {
    getAll: () => getArray(),
    get: (id) => getArray().find((r) => r.id === id),
    upsert: (row) => {
      const valid = validate ? validate(row) : row
      const arr = getArray()
      const i = arr.findIndex((r) => r.id === valid.id)
      if (i >= 0) arr[i] = valid
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
