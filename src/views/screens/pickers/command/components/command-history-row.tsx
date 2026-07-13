import { Component } from '@geajs/core'
import { copyHistoryEntry } from '../command.store'

export interface CommandHistoryRowProps {
  command: string
}

// One command-history row: the command text plus a "Copy" button. Both the row and
// the button copy the command and flash "Copied" on the button — which needs the
// real button node, captured via a property `ref` and read at click time (it is set
// after render, so it can't be passed at template-build time).
export default class CommandHistoryRow extends Component {
  declare props: CommandHistoryRowProps
  copyBtn: HTMLButtonElement | null = null

  private copy = (): void => {
    if (this.copyBtn) copyHistoryEntry(this.props.command, this.copyBtn)
  }

  template({ command }: this['props']) {
    return (
      <div class="pick-row cmd-row" onClick={this.copy}>
        <span class="cmd-text">{command}</span>
        <button
          class="cmd-copy"
          ref={this.copyBtn}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            this.copy()
          }}
        >
          Copy
        </button>
      </div>
    )
  }
}
