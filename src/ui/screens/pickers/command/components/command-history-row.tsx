import { makeHistoryBtnCopy, makeHistoryRowCopy } from '../command.state'

interface CommandHistoryRowProps {
  command: string
}

export function commandHistoryRow({ command }: CommandHistoryRowProps): HTMLDivElement {
  const text = (<span class="cmd-text">{command}</span>) as HTMLSpanElement
  const btn = (<button class="cmd-copy">Copy</button>) as HTMLButtonElement
  btn.addEventListener('click', makeHistoryBtnCopy(command, btn))
  const row = (
    <div class="pick-row cmd-row">
      {text}
      {btn}
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', makeHistoryRowCopy(command, btn))
  return row
}
