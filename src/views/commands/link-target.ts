// Where a Cmd+clicked terminal link goes. Every file opens in-app — markdown in the
// viewer, anything else in the Monaco code pane — so a terminal link lands in the same
// place as clicking the file in the Files tree. (The `ide` command is still used by the
// explicit "Split with IDE" action.)
export type LinkTargetKind = 'url' | 'markdown' | 'code'

export function linkTargetKind(target: string): LinkTargetKind {
  if (/^https?:\/\//i.test(target)) return 'url'
  return /\.(?:mdx|mdc|md)$/i.test(target) ? 'markdown' : 'code'
}
