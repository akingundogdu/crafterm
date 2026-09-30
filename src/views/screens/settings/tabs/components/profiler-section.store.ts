import { Store } from '@geajs/core'
import {
  isProfilerRunning,
  profilerLogPath,
  startProfiler,
  stopProfiler
} from '@views/profiler/profiler'

// State for the Settings profiler control. Deliberately session-scoped rather than
// a persisted preference: profiling is an action you take while investigating, and
// a remembered checkbox would silently instrument every future launch.
class ProfilerSectionStore extends Store {
  running = isProfilerRunning()
  path = profilerLogPath()
  busy = false

  async toggle(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      if (this.running) {
        await stopProfiler()
        this.running = false
      } else {
        this.path = await startProfiler()
        this.running = true
      }
    } catch {
      // Starting writes a file and stopping closes one; if either fails the button
      // must still come back rather than stay stuck on "busy".
    } finally {
      this.busy = false
    }
  }
}

export default new ProfilerSectionStore()
