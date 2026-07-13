import { Component } from '@geajs/core'
import type { DateField, DateFieldMode, FieldModel } from '../datepicker.types'
import { dispatchChange, positionPopover, makeOutsideDown, makeEscapeKey } from '../datepicker.store'
import { CalendarStore } from './popover.store'
import PopoverBody from './popover-grid'

// Thin, imperatively-mounted popover shell. It owns the per-instance CalendarStore
// and renders the reactive body as a JSX child (PopoverBody) — a top-level,
// imperatively-mounted component does not re-subscribe on store writes, so all
// reactive markup lives in the child (the ssh SshPicker → SshList pattern). Data
// arrives via the constructor into a plain field.
class DatePopover extends Component {
  private readonly store: CalendarStore

  constructor(opts: { store: CalendarStore }) {
    super()
    this.store = opts.store
  }

  template() {
    return <PopoverBody store={this.store} />
  }
}

// Opens the calendar popover anchored to the trigger. Builds a fresh reactive store
// (no cross-field bleed), mounts the shell into <body>, clamps it to the viewport,
// and wires the outside-click + escape teardown via `close`. Signature preserved so
// the trigger opens it unchanged.
export function openPopover(mode: DateFieldMode, model: FieldModel, btn: DateField, syncText: () => void): void {
  document.querySelector('.datepicker-pop')?.remove()

  const store = new CalendarStore(mode, model, () => dispatchChange(btn), syncText)
  new DatePopover({ store }).render(document.body)

  const pop = document.querySelector('.datepicker-pop') as HTMLElement | null
  if (!pop) return
  positionPopover(pop, btn)

  const onDown = makeOutsideDown(pop, btn, () => close())
  const onKey = makeEscapeKey(() => close())
  function close(): void {
    document.removeEventListener('mousedown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
    pop!.remove()
  }
  store.onClose = close
  document.addEventListener('mousedown', onDown, true)
  document.addEventListener('keydown', onKey, true)
}
