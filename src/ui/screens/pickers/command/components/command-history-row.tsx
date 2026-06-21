import { makeHistoryBtnCopy, makeHistoryRowCopy } from '../command.state'

interface CommandHistoryRowProps {
  command: string
}

export function commandHistoryRow({ command }: CommandHistoryRowProps): HTMLDivElement {
  const text = (<span class="cmd-text">{command}</span>) as HTMLSpanElement
  // makeHistoryBtnCopy needs the button itself, which isn't bound until the JSX
  // expression resolves; keep the listener imperative so it reads the real node.
  const btn = (<button class="cmd-copy">Copy</button>) as HTMLButtonElement
  btn.addEventListener('click', makeHistoryBtnCopy(command, btn))
  const row = (
    <div class="pick-row cmd-row" onClick={makeHistoryRowCopy(command, btn)}>
      {text}
      {btn}
    </div>
  ) as HTMLDivElement
  return row
}
