import { execFile } from 'child_process'
import { dockerBin } from '../services/exec/exec.service'
import type { DockerRow } from '@services/docker/docker.types'

// Run docker with args; resolve { ok, out, err }. `timeout` guards slow calls
// (image pulls aside, the read commands here are quick; stats is the slowest).
export function dockerRun(
  args: string[],
  timeout = 8000
): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(dockerBin(), args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: stdout ?? '', err: error ? stderr || error.message : '' })
    })
  })
}

// Parse `--format '{{json .}}'` output: one JSON object per non-empty line.
export function parseJsonLines(out: string): DockerRow[] {
  const rows: DockerRow[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      rows.push(JSON.parse(t))
    } catch {
      // skip malformed line
    }
  }
  return rows
}

