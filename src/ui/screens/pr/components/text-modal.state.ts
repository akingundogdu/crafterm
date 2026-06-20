// Closes the modal on Escape and unregisters the listener when it closes.
export function bindEscapeClose(close: () => void, onClose: (cb: () => void) => void): void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))
}
