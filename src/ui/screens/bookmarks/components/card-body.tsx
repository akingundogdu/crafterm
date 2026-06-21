import type { Bookmark } from '@ui/types/types'
import { bodyClass } from './bookmark-card.state'

export function createCardBody(bm: Bookmark): HTMLElement {
  return (<div class={bodyClass(bm)}>{bm.content}</div>) as HTMLDivElement
}
