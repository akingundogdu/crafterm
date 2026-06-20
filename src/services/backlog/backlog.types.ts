// Backlog bridge types (backlog:* channels).
export interface BacklogItem {
  id: string
  text: string
  status: string
}

export interface BacklogFile {
  path: string
  items: BacklogItem[]
}
