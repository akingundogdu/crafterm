import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

export interface PaneHeaderProps {
  onTaskChipClick: (e: MouseEvent) => void
  onMenuClick: (e: MouseEvent) => void
  onCloseClick: (e: MouseEvent) => void
}

export interface PaneHeader {
  header: HTMLDivElement
  htitle: HTMLSpanElement
}

export function createPaneHeader(props: PaneHeaderProps): PaneHeader {
  const htitle = el('span', { class: 'pane-title' }, 'zsh')
  // Chip showing the assigned daily task (hidden until one is assigned). Clicking
  // it opens the assign/update modal.
  const taskChip = el('button', {
    class: 'pane-daily-chip',
    style: 'display: none',
    title: UITexts.Terminal.dailyTicket,
    onClick: props.onTaskChipClick
  })
  const menuBtn = el(
    'button',
    { class: 'pane-btn', title: UITexts.Terminal.paneOptions, onClick: props.onMenuClick },
    '⋯'
  )
  const close = el('button', { class: 'pane-close', onClick: props.onCloseClick }, '×')
  const header = el('div', { class: 'pane-header' }, htitle, taskChip, menuBtn, close)

  return { header, htitle }
}
