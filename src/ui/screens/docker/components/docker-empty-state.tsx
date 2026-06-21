import { UITexts } from '@texts'
import { createButton } from '@ui/components'

// The "Docker is not available" message shown when the daemon can't be reached,
// with a Retry button.

export interface DockerEmptyStateOptions {
  error?: string
  onRetry: () => void
}

export function createDockerEmptyState(opts: DockerEmptyStateOptions): HTMLElement {
  return (
    <div class="docker-empty">
      <div class="docker-empty-title">Docker is not available</div>
      <div class="docker-empty-sub">{opts.error || 'Start Docker Desktop and try again.'}</div>
      {createButton({
        className: 'settings-inline-btn',
        text: UITexts.Docker.retry,
        onClick: opts.onRetry
      })}
    </div>
  ) as HTMLDivElement
}
