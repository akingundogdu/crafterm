// Click handler for a row action button: stops the row click from firing, then
// runs the injected action.
export function makeRowActionClick(run: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    run()
  }
}
