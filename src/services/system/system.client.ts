import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { QuitProcessRequest } from './system.types'

// System resource IPC (system:*): CPU + memory metrics for the status-bar chip,
// the per-application process breakdown for its popover, and quitting an app.
class SystemClient extends BaseClient {
  metrics = () => this.call(Channel.System.Metrics)
  processes = () => this.call(Channel.System.Processes)
  quitProcess = (req: QuitProcessRequest) => this.call(Channel.System.Quit, req)
}

export const systemService = new SystemClient()
