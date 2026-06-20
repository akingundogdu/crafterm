import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync } from 'fs'
import type { BacklogFile } from './backlog.types'

// Backlog domain logic: read ~/.crafterm/todo-list.json (shared by dev + prod) and
// return its validated items plus the resolved path, so the renderer's spotlight can
// list backlog entries and open the file in the code editor without hardcoding a path.
export class BacklogService {
  read(): BacklogFile | null {
    const file = join(homedir(), '.crafterm', 'todo-list.json')
    if (!existsSync(file)) return null
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      const items = Array.isArray(parsed?.items)
        ? parsed.items
            .filter((it: unknown): it is { id: string; text: string; status?: string } => {
              const o = it as { id?: unknown; text?: unknown }
              return typeof o?.id === 'string' && typeof o?.text === 'string'
            })
            .map((it: { id: string; text: string; status?: string }) => ({
              id: it.id,
              text: it.text,
              status: typeof it.status === 'string' ? it.status : ''
            }))
        : []
      return { path: file, items }
    } catch {
      return null
    }
  }
}
