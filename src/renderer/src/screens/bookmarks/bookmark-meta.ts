import type { Bookmark } from '../../types'

export type TypeFilter = 'all' | Bookmark['type']

export const TYPE_LABEL: Record<Bookmark['type'], string> = {
  link: 'Link',
  text: 'Text',
  code: 'Code',
  snippet: 'Snippet'
}
