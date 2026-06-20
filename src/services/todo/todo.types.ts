// Todo-list bridge types (todo:* channels).
export interface TodoReadRequest {
  path?: string
}

export interface TodoWriteRequest {
  path: string
  content: string
}
