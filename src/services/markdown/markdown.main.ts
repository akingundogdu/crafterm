import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { MarkdownService } from './markdown.service'

// Markdown IPC adapter (markdown:*): open in the user's Markdown app + recursive
// .md finder. All logic lives in markdown.service.ts.
export class MarkdownController extends BaseService {
  readonly name = 'markdown'
  private readonly service = new MarkdownService()

  register(): void {
    this.on(Channel.Markdown.Open, ({ path }) => this.service.open(path))
    this.handle(Channel.Markdown.FindAll, ({ root }) => this.service.findAll(root))
  }
}

