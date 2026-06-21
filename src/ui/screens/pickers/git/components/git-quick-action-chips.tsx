interface GitQuickActionChipsProps {
  onFetch: (e: MouseEvent) => void
  onPull: (e: MouseEvent) => void
  onStatus: (e: MouseEvent) => void
}

export function gitQuickActionChips({
  onFetch,
  onPull,
  onStatus
}: GitQuickActionChipsProps): HTMLDivElement {
  return (
    <div class="git-quick-actions">
      <button class="git-quick-chip" type="button" title="git fetch --all --prune" onClick={onFetch}>
        Fetch
      </button>
      <button class="git-quick-chip" type="button" title="git pull" onClick={onPull}>
        Pull
      </button>
      <button class="git-quick-chip" type="button" title="git status" onClick={onStatus}>
        Status
      </button>
    </div>
  ) as HTMLDivElement
}
