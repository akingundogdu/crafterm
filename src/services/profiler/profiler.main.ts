import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import * as profiler from '@core/services/profiler/profiler.service'

// Profiler IPC adapter (profiler:*). Logic lives in @core/services/profiler; this
// only binds the channels the renderer's collector drives.
export class ProfilerController extends BaseService {
  readonly name = 'profiler'

  register(): void {
    this.handle(Channel.Profiler.Start, () => profiler.start())
    this.handle(Channel.Profiler.Stop, () => profiler.stop())
    this.on(Channel.Profiler.Append, (req) => profiler.append(req.records))
  }

  dispose(): void {
    profiler.stop()
  }
}
