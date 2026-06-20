import type { Bookmark } from '@ui/types/types'
import { UITexts } from '@texts'

export type TypeFilter = 'all' | Bookmark['type']

export const TYPE_LABEL: Record<Bookmark['type'], string> = {
  link: UITexts.Bookmarks.typeLabel.link,
  text: UITexts.Bookmarks.typeLabel.text,
  code: UITexts.Bookmarks.typeLabel.code,
  snippet: UITexts.Bookmarks.typeLabel.snippet
}
