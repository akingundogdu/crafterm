import { Channel } from '@services/channels.client'
import { BaseClient } from '@services/base.client'
import type { ProfilerRecord, ProfilerSession } from './profiler.types'

// Renderer wrappers for profiler:*. `append` is fire-and-forget: a dropped batch
// costs one sample and must never make the collector await inside a hot path.
export class ProfilerClient extends BaseClient {
  start = (): Promise<ProfilerSession> => this.call(Channel.Profiler.Start)
  stop = (): Promise<void> => this.call(Channel.Profiler.Stop)
  append = (records: ProfilerRecord[]): void => this.send(Channel.Profiler.Append, { records })
}

export const profilerService = new ProfilerClient()
