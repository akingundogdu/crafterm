import { el } from '@views/lib/dom'
import { makeHistoryBtnCopy, makeHistoryRowCopy } from '../command.state'

interface CommandHistoryRowProps {
  command: string
}

export function commandHistoryRow({ command }: CommandHistoryRowProps): HTMLDivElement {
  const text = el('span', { class: 'cmd-text' }, command)
  // makeHistoryBtnCopy needs the button itself, which isn't bound until the
  // element exists; keep the listener imperative so it reads the real node.
  const btn = el('button', { class: 'cmd-copy' }, 'Copy')
  btn.addEventListener('click', makeHistoryBtnCopy(command, btn))
  const row = el('div', { class: 'pick-row cmd-row', onClick: makeHistoryRowCopy(command, btn) }, text, btn)
  return row
}
