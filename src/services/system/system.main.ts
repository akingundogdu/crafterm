import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import * as systemMetrics from '@core/services/system-metrics/system-metrics.service'

// System resource IPC adapter (system:*): machine CPU + memory metrics, the
// per-application process breakdown, and quitting one application. Logic lives in
// @core/services/system-metrics.
export class SystemController extends BaseService {
  readonly name = 'system'

  // CPU percentages are deltas between two tick samples; take the first one at
  // startup so the chip's first poll already has an interval to measure.
  setup(): void {
    systemMetrics.prime()
  }

  register(): void {
    this.handle(Channel.System.Metrics, () => systemMetrics.metrics())
    this.handle(Channel.System.Processes, () => systemMetrics.processes())
    this.handle(Channel.System.Quit, (req) => systemMetrics.quitProcesses(req))
  }
}
