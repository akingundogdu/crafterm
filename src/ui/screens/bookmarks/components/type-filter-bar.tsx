import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { TYPE_LABEL } from '../bookmark-meta'
import { TYPE_FILTERS, currentTypeFilter, makeTypeFilterClick } from '../bookmarks.state'

// The type filter chip bar: one chip per bookmark type plus "all", with the
// active filter marked.

export interface TypeFilterBarOptions {
  onRerender: () => void
}

export function createTypeFilterBar(opts: TypeFilterBarOptions): HTMLElement {
  return (
    <div class="bookmarks-filters">
      {TYPE_FILTERS.map((t) =>
        createButton({
          text: t === 'all' ? UITexts.Bookmarks.allFilter : TYPE_LABEL[t],
          className: 'bookmarks-filter' + (t === currentTypeFilter() ? ' active' : ''),
          onClick: makeTypeFilterClick(t, opts.onRerender)
        })
      )}
    </div>
  ) as HTMLDivElement
}
