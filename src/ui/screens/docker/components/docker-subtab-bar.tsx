import { createButton } from '@ui/components'
import type { SubTab } from '../docker.types'
import { SUB_TABS, currentSubTab } from '../docker.state'

// The sub-tab bar: containers / images / volumes / networks / compose buttons,
// with the current tab marked active.

export interface DockerSubTabBarOptions {
  onSelect: (key: SubTab) => () => void
}

export function createDockerSubTabBar(opts: DockerSubTabBarOptions): HTMLElement {
  return (
    <div class="docker-subtabs">
      {SUB_TABS.map((t) =>
        createButton({
          className: 'docker-subtab' + (t.key === currentSubTab() ? ' active' : ''),
          text: t.label,
          onClick: opts.onSelect(t.key)
        })
      )}
    </div>
  ) as HTMLDivElement
}
