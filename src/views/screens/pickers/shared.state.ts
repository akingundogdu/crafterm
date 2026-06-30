// Last path segment (the directory/file name), tolerant of a trailing slash.
export function baseName(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}
