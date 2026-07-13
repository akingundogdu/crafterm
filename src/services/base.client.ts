import { call, send, listen } from './channels.client'

// Base class for renderer-side IPC clients. Subclasses expose typed wrappers using
// `this.call` / `this.send` / `this.listen` (as arrow-function fields so call sites
// can pass them around), and the service folder exports a singleton instance
// (`export const xService = new XClient()`) so call sites stay unchanged.
export abstract class BaseClient {
  protected readonly call = call
  protected readonly send = send
  protected readonly listen = listen
}
