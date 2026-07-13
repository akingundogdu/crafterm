import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import { TerminalService } from './terminal.service'

// Terminal IPC adapter (pty:* / proc:*): where the renderer reaches the real shell
// via the Node main process. The pty:* channels delegate to the @core terminal
// manager; the stateful background-process (proc:*) logic + replay buffers live in
// terminal.service.ts.
export class TerminalController extends BaseService {
  readonly name = 'terminal'
  private readonly service = new TerminalService()

  register(): void {
    this.handle(Channel.Pty.Create, (opts, e) => terminal.create(e.sender, opts))

    // A pop-out window adopts an existing pane: its output now flows to that window.
    this.on(Channel.Pty.Adopt, ({ id }, e) => {
      terminal.adopt(id, e.sender)
    })

    this.on(Channel.Pty.Input, ({ id, data }) => {
      terminal.write(id, data)
    })

    this.on(Channel.Pty.Resize, ({ id, cols, rows }) => {
      terminal.resize(id, cols, rows)
    })

    this.on(Channel.Pty.Kill, ({ id }) => {
      terminal.kill(id)
      this.service.dropBuffer(id)
    })

    this.handle(Channel.Proc.Start, (opts, e) => this.service.start(opts, e.sender))

    // Replay buffer for an attaching view (the output produced while nothing watched).
    this.handle(Channel.Proc.Buffer, ({ id }) => this.service.buffer(id))

    // Re-route a background process's live stream to the window attaching a view.
    this.on(Channel.Proc.Attach, ({ id }, e) => {
      this.service.attach(id, e.sender)
    })
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
