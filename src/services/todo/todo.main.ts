import { handle, Channel } from '@services/channels.main'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// Read/write the user-configured todo-list.md (Improve Crafterm panel).
function resolveTodoPath(p?: string): string {
  let path = (p || '').trim()
  if (path.startsWith('~')) path = join(homedir(), path.slice(1))
  return path
}

// Todo bridge (todo:*): read/write the user-configured todo-list.md.
export function registerTodoIpc(): void {
  handle(Channel.Todo.Read, ({ path }) => {
    const file = resolveTodoPath(path)
    if (!file || !existsSync(file)) return null
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return null
    }
  })
  handle(Channel.Todo.Write, ({ path, content }) => {
    const file = resolveTodoPath(path)
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
