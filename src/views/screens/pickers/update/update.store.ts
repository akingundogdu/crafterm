import { Store } from '@geajs/core'

// Reactive state for the self-update progress modal. `steps` is the source of
// truth, read in the list view's template() so gea patches the rows as the async
// update flow advances (the board pattern). `error` holds the failure message +
// drives the Close button. `rev` is bumped on every mutation to force a refresh
// of the imperatively-mounted shell's reactive child.
export type UpdateStepStatus = 'active' | 'done' | 'failed'

export interface UpdateStepState {
  id: number
  label: string
  status: UpdateStepStatus
}

class UpdateStore extends Store {
  steps: UpdateStepState[] = []
  error: string | null = null
  rev = 0

  reset(): void {
    this.steps = []
    this.error = null
    this.rev = 0
  }

  addStep(label: string): number {
    const id = this.steps.length
    this.steps = [...this.steps, { id, label, status: 'active' }]
    this.rev++
    return id
  }

  markDone(id: number): void {
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, status: 'done' } : s))
    this.rev++
  }

  markFailed(id: number, message: string): void {
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, status: 'failed' } : s))
    this.error = message
    this.rev++
  }
}

export default new UpdateStore()
