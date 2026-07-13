import { Component } from '@geajs/core'
import TreeRowList from './components/row-list'

// The tree's gea root: a display:contents wrapper (so rows lay out flat in the
// consumer's host) around the reactive `TreeRowList` child. Mounted imperatively
// by `createTreeView` (`new TreeView(storeId).render(host)`), so it carries the
// string `storeId` as a plain constructor field — a manual `new` does not
// populate `props`, and only the string ever crosses into the child.
export default class TreeView extends Component {
  private readonly storeId: string

  constructor(storeId: string) {
    super()
    this.storeId = storeId
  }

  template() {
    return (
      <div class="treeview-root" style={{ display: 'contents' }}>
        <TreeRowList storeId={this.storeId} />
      </div>
    )
  }
}
