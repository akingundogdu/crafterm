import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Markdown IPC (markdown:*): open in the user's Markdown app + recursive .md finder.
class MarkdownClient extends BaseClient {
  open = (path: string) => this.send(Channel.Markdown.Open, { path })
  findAll = (root?: string) => this.call(Channel.Markdown.FindAll, { root })
}

export const markdownService = new MarkdownClient()
