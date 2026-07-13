import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// Todo IPC adapter (todo:*): read/write the user-configured todo-list.md (Improve
// Crafterm panel). Direct fs I/O, thin enough to need no .service.ts.
export class TodoController extends BaseService {
  readonly name = 'todo'

  // Resolve the user-configured todo-list.md path (~ expansion).
  private resolvePath(p?: string): string {
    let path = (p || '').trim()
    if (path.startsWith('~')) path = join(homedir(), path.slice(1))
    return path
  }

  register(): void {
    this.handle(Channel.Todo.Read, ({ path }) => {
      const file = this.resolvePath(path)
      if (!file || !existsSync(file)) return null
      try {
        return readFileSync(file, 'utf8')
      } catch {
        return null
      }
    })
    this.handle(Channel.Todo.Write, ({ path, content }) => {
      const file = this.resolvePath(path)
      if (!file) return false
      try {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, content)
        return true
      } catch {
        return false
      }
    })
  }
}

