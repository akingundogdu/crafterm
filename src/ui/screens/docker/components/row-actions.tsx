import { createButton } from '@ui/components'
import type { RowOptions } from './row.types'
import { makeRowActionClick } from './row.state'

export function rowActions(actions: RowOptions['actions']): HTMLElement {
  return (
    <div class="docker-row-actions">
      {actions.map((a) =>
        createButton({
          className: 'docker-act' + (a.cls ? ' ' + a.cls : ''),
          text: a.label,
          title: a.label,
          onClick: makeRowActionClick(a.run)
        })
      )}
    </div>
  )
}
