import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { ClaudeService } from './claude.service'

// Claude IPC adapter (claude:*). Thin: maps each channel to a ClaudeService method;
// all logic + caches + watchers live in claude.service.ts.
export class ClaudeController extends BaseService {
  readonly name = 'claude'
  private readonly service = new ClaudeService()

  register(): void {
    this.handle(Channel.Claude.UsageSummary, () => this.service.usageSummary())
    this.handle(Channel.Claude.RealUsage, (opts) => this.service.realUsage(opts))
    this.handle(Channel.Claude.SessionTitle, ({ cwd, sessionId }) => this.service.sessionTitle(cwd, sessionId))
    this.handle(Channel.Claude.SessionStatus, ({ cwd, sessionId }) => this.service.sessionStatus(cwd, sessionId))
    this.handle(Channel.Claude.PermissionMode, ({ cwd, sessionId }) => this.service.permissionMode(cwd, sessionId))
    this.handle(Channel.Claude.LatestSession, ({ cwd, since, ofSession }) =>
      this.service.latestSession(cwd, since, ofSession)
    )
    this.handle(Channel.Claude.SessionCwd, ({ sessionId }) => this.service.sessionCwd(sessionId))
    this.handle(Channel.Claude.Sessions, () => this.service.sessions())
    this.handle(Channel.Claude.WatchSessions, ({ cwd }) => this.service.watchSessions(cwd))
  }

  dispose(): void {
    this.service.dispose()
  }
}
