import { Component } from '@geajs/core'
import { getTreeRuntime } from '../treeview.registry'
import TreeRow from './row'
import TreeHeader from './row-header'

// The reactive row list. This is the JSX child that reads the per-instance
// reactive store (via the registry) so gea re-renders it on every
// `store.visible` reassignment — a single top-level keyed `.map()` of `<TreeRow>`
// / `<TreeHeader>` children (no imperative `new Row().render()` in a loop, which
// is what batches/defers under churn). The empty hint is an unconditional sibling
// of the map, not a branch that swaps the list out.
export default class TreeRowList extends Component {
  declare props: { storeId: string }

  template({ storeId }: this['props']) {
    const { store, ctx } = getTreeRuntime(storeId)
    const items = store.visible
    return (
      <div class="treeview-rows" style={{ display: 'contents' }}>
        {items.map((it) =>
          it.kind === 'header' ? (
            <TreeHeader key={'h:' + it.id} storeId={storeId} id={it.id} />
          ) : (
            <TreeRow
              key={'r:' + it.id}
              storeId={storeId}
              id={it.id}
              depth={it.depth}
              guides={it.guides}
              isLast={it.isLast}
              num={it.num}
            />
          )
        )}
        {items.length === 0 && <div class="empty-hint">{ctx.getFilter() ? 'No matches' : 'Nothing here yet.'}</div>}
      </div>
    )
  }
}
