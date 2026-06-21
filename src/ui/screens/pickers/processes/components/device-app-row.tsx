import type { CollectedProcess } from '@services/bgproc'

interface DeviceAppRowProps {
  item: CollectedProcess
  onStop: (e: MouseEvent) => void
}

export function deviceAppRow({ item, onStop }: DeviceAppRowProps): HTMLDivElement {
  return (
    <div class="pick-row worktree-row">
      <div class="claude-main">
        <span class="claude-title">{item.proc.title}</span>
        <span class="claude-sub">{item.proc.cwd}</span>
      </div>
      <button class="worktree-action worktree-remove" onClick={onStop}>
        Stop app
      </button>
    </div>
  ) as HTMLDivElement
}
