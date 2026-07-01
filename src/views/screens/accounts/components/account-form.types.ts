// A pending field-edit row. Tracks the raw (possibly secret) value separately
// from the draft so secret plaintext never round-trips through the draft/JSON.
export interface PendingField {
  key: string
  rawValue: string
  secret: boolean
  existed: boolean
}

// A reactive field row in the gea account form. Extends PendingField with a
// stable `id` (keys the row across re-renders) and the non-secret `value` (kept
// out of `rawValue`, which holds secret plaintext bound for safeStorage). Secret
// plaintext never enters `value`, so it never round-trips through the draft/JSON.
export interface FormField {
  id: string
  key: string
  value: string
  rawValue: string
  secret: boolean
  existed: boolean
}
