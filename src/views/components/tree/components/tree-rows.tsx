import { Component } from '@geajs/core'
import './tree-rows.css'
import { getTreeRuntime } from '../tree.registry'
import TreeRow from './tree-row'
import TreeSection from './tree-section'

// The row list. Reads the per-instance store (via the registry) and lays the
// flattened items out as a single top-level keyed `.map()` of `<TreeRow>` /
// `<TreeSection>` children. The controller re-mounts this view on every structural
// rebuild, so it reads fresh data at each mount (no cross-render reactivity). The
// empty hint is an unconditional sibling of the map.
export default class TreeRows extends Component {
  declare props: { treeId: string }

  template({ treeId }: this['props']) {
    const { store, getFilter } = getTreeRuntime(treeId)
    const items = store.flat
    return (
      <div class="crtree-rows" style={{ display: 'contents' }}>
        {items.map((it) =>
          it.kind === 'header' ? (
            <TreeSection key={'h:' + it.section.id} treeId={treeId} id={it.section.id} />
          ) : (
            <TreeRow
              key={'r:' + it.row.id}
              treeId={treeId}
              id={it.row.id}
              depth={it.depth}
              guides={it.guides}
              num={it.num}
            />
          )
        )}
        {items.length === 0 ? (
          <div class="crtree-empty">{getFilter() ? 'No matches' : 'Nothing here yet.'}</div>
        ) : null}
      </div>
    )
  }
}
