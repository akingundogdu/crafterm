import { createOverlay } from '@views/components/overlay/overlay'
import store from './time-report.store'
import TimeReport from './time-report'

// Opens the gea time-report modal: a @views overlay backdrop + the gea TimeReport
// body mounted inside, with the range reset to its default. Self-contained — no
// @ui (§2.7).
export function openReport(): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  store.open(() => ov.close())
  new TimeReport().render(ov.overlay)
  ov.mount()
}
