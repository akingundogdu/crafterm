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
  const htitle = (<span class="pane-title">zsh</span>) as HTMLSpanElement
  // Chip showing the assigned daily task (hidden until one is assigned). Clicking
  // it opens the assign/update modal.
  const taskChip = (
    <button class="pane-daily-chip" style="display: none" title={UITexts.Terminal.dailyTicket} onClick={props.onTaskChipClick} />
  ) as HTMLButtonElement
  const menuBtn = (
    <button class="pane-btn" title={UITexts.Terminal.paneOptions} onClick={props.onMenuClick}>
      ⋯
    </button>
  ) as HTMLButtonElement
  const close = (
    <button class="pane-close" onClick={props.onCloseClick}>
      ×
    </button>
  ) as HTMLButtonElement
  const header = (
    <div class="pane-header">
      {htitle}
      {taskChip}
      {menuBtn}
      {close}
    </div>
  ) as HTMLDivElement

  return { header, htitle }
}
