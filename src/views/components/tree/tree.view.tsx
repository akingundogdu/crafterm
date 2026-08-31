import { Component } from '@geajs/core'
import './tree.css'
import TreeRows from './components/tree-rows'

// The tree's mount root. Imperatively mounted into a consumer host, so the
// reactive content lives in a JSX CHILD (`<TreeRows/>`) that reads the per-instance
// store via the registry and thus re-subscribes to store writes (a top-level
// imperatively-mounted component would not). `treeId` arrives via the constructor
// into a plain field — a manual `new X()` does not populate `this.props`.
export default class TreePanelView extends Component {
  private readonly treeId: string

  constructor(treeId: string) {
    super()
    this.treeId = treeId
  }

  template() {
    return (
      <div class="crtree-root" style={{ display: 'contents' }}>
        <TreeRows treeId={this.treeId} />
      </div>
    )
  }
}
