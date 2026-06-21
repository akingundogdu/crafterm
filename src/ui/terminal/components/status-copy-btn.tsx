import { UITexts } from '@texts'
import { COPY_ICON } from '../status-bar.state'

// Button that copies the pane's full cwd path, flashing a check on success.
export function createStatusCopyBtn(onClick: (e: Event) => void): HTMLButtonElement {
  const copyBtn = (
    <button
      class="pane-status-copy"
      title={UITexts.Terminal.copyFullPath}
      aria-label={UITexts.Terminal.copyFullPath}
      innerHTML={COPY_ICON}
      onClick={onClick}
    />
  ) as HTMLButtonElement
  return copyBtn
}
