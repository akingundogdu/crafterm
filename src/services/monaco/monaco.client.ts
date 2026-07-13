import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Monaco theme IPC (monaco:*): load a bundled monaco-themes theme JSON by name.
class MonacoClient extends BaseClient {
  theme = (name: string) => this.call(Channel.Monaco.Theme, { name })
}

export const monacoService = new MonacoClient()
