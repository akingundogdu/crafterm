import { handle, on, emit } from './channels.main'

// Base class for main-process IPC services. A subclass binds its channel handlers
// in `register()`, and may implement `setup()` (one-time init — deps, watchers) and
// `dispose()` (teardown on app quit). Handlers are bound via the registry-typed
// `this.handle` / `this.on` / `this.emit` helpers (a service's own `.types` are
// imported directly where needed).
export abstract class BaseService {
  abstract readonly name: string
  setup?(): void | Promise<void>
  abstract register(): void
  dispose?(): void
  protected readonly handle = handle
  protected readonly on = on
  protected readonly emit = emit
}
