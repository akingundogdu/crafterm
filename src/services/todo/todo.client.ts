import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Todo-list IPC (todo:*): read/write the todo-list markdown for the Improve panel.
class TodoClient extends BaseClient {
  read = (path?: string) => this.call(Channel.Todo.Read, { path })
  write = (path: string, content: string) => this.call(Channel.Todo.Write, { path, content })
}

export const todoService = new TodoClient()
