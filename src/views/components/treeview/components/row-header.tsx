import { Component } from '@geajs/core'
import { getTreeRuntime } from '../treeview.registry'

// A section header slot: a display:contents host tagged with its id + rev. The
// consumer-built external header node (`sectionLabel` / `groupHeader`) is appended
// by the controller's post-render pass (see dom-sync) — an interpolated node
// renders as an empty comment, and onAfterRender is mount-only so it can't refresh
// a reused slot. Reading `store.rev` keeps this in gea's re-render set.
export default class TreeHeader extends Component {
  declare props: { storeId: string; id: string }

  template({ storeId, id }: this['props']) {
    const { store } = getTreeRuntime(storeId)
    return <div class="tree-header-slot" data-hdr={id} data-rev={String(store.rev)} style={{ display: 'contents' }} />
  }
}
