import type { Bookmark } from '@views/types/types'
import { UITexts } from '@texts'

export const TYPE_LABEL: Record<Bookmark['type'], string> = {
  link: UITexts.Bookmarks.typeLabel.link,
  text: UITexts.Bookmarks.typeLabel.text,
  code: UITexts.Bookmarks.typeLabel.code,
  snippet: UITexts.Bookmarks.typeLabel.snippet
}
