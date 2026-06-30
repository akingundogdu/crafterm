// A single progress row in the self-update modal.
export interface UpdateStep {
  done: () => void
  fail: (msg: string) => void
}
