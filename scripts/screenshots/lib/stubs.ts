import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DemoWorkspace } from './demo-repo.js'

// Stub `gh` and `docker` binaries (injected via CRAFTERM_GH_BIN / CRAFTERM_DOCKER_BIN,
// see src/core/services/exec/exec.service.ts). They print canned JSON for the demo
// workspace — no GitHub account, no Docker daemon, no network, and nothing from the
// developer's real environment can leak into a frame.

const GH_STUB = `#!/bin/sh
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") echo "acme/acme-web"; exit 0 ;;
  "pr list")
    cat <<'JSON'
[
 {"number":128,"title":"feat(checkout): dark mode for the summary card","headRefName":"feature/dark-mode","baseRefName":"main","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","reviewDecision":"APPROVED","url":"https://example.com/pr/128","statusCheckRollup":[{"status":"COMPLETED","conclusion":"SUCCESS"}],"comments":[],"updatedAt":"2026-07-14T08:10:00Z"},
 {"number":126,"title":"feat(cart): stack promo codes with free shipping","headRefName":"feature/checkout-v2","baseRefName":"main","state":"OPEN","isDraft":false,"mergeable":"CONFLICTING","reviewDecision":"CHANGES_REQUESTED","url":"https://example.com/pr/126","statusCheckRollup":[{"status":"COMPLETED","conclusion":"FAILURE"}],"comments":[{"id":1},{"id":2}],"updatedAt":"2026-07-13T16:42:00Z"},
 {"number":121,"title":"chore(api): paginate the orders endpoint","headRefName":"feature/orders-page","baseRefName":"main","state":"OPEN","isDraft":true,"mergeable":"MERGEABLE","reviewDecision":"REVIEW_REQUIRED","url":"https://example.com/pr/121","statusCheckRollup":[{"status":"IN_PROGRESS","conclusion":null}],"comments":[],"updatedAt":"2026-07-12T09:05:00Z"}
]
JSON
    exit 0 ;;
  "pr diff")
    cat <<'DIFF'
diff --git a/src/styles.css b/src/styles.css
index 1a2b3c4..5d6e7f8 100644
--- a/src/styles.css
+++ b/src/styles.css
@@ -1,4 +1,7 @@
 :root {
   --brand: #6aa9ff;
   --surface: #12161c;
+  --surface-dark: #05070a;
+  --text-dim: #8b949e;
 }
+
diff --git a/src/routes/checkout.ts b/src/routes/checkout.ts
index 2b3c4d5..6e7f8a9 100644
--- a/src/routes/checkout.ts
+++ b/src/routes/checkout.ts
@@ -6,8 +6,9 @@ interface CheckoutRequest {
 export async function checkout(req: CheckoutRequest): Promise<{ total: number }> {
   const base = subtotal(req.lines)
-  const total = req.promo ? applyPromo(base, req.promo) : base
+  const total = req.promo ? applyPromo(base, req.promo.trim().toUpperCase()) : base
   if (total <= 0) throw new Error('empty cart')
   return { total }
 }
DIFF
    exit 0 ;;
  *) echo '[]'; exit 0 ;;
esac
`

const DOCKER_STUB = `#!/bin/sh
case "$1 $2" in
  "version "*|"version") echo "27.3.1"; exit 0 ;;
  "ps "*)
    echo '{"ID":"9f21ac04b7d1","Names":"acme-web","State":"running","Image":"acme/web:2.4.0","Status":"Up 42 minutes","Ports":"0.0.0.0:3000->3000/tcp"}'
    echo '{"ID":"3c8de1907aa5","Names":"acme-api","State":"running","Image":"acme/api:1.9.2","Status":"Up 42 minutes","Ports":"0.0.0.0:4000->4000/tcp"}'
    echo '{"ID":"b70f5d2ce913","Names":"acme-postgres","State":"running","Image":"postgres:16-alpine","Status":"Up 2 hours (healthy)","Ports":"0.0.0.0:5432->5432/tcp"}'
    echo '{"ID":"5ea1f3b8c072","Names":"acme-redis","State":"exited","Image":"redis:7-alpine","Status":"Exited (0) 12 minutes ago","Ports":""}'
    exit 0 ;;
  "images "*)
    echo '{"ID":"sha256:1a2b3c","Repository":"acme/web","Tag":"2.4.0","Size":"184MB","CreatedSince":"2 hours ago"}'
    echo '{"ID":"sha256:4d5e6f","Repository":"acme/api","Tag":"1.9.2","Size":"131MB","CreatedSince":"3 days ago"}'
    echo '{"ID":"sha256:7a8b9c","Repository":"postgres","Tag":"16-alpine","Size":"243MB","CreatedSince":"3 weeks ago"}'
    exit 0 ;;
  "stats "*)
    echo '{"ID":"9f21ac04b7d1","CPUPerc":"3.40%","MemPerc":"2.10%","MemUsage":"168MiB / 8GiB"}'
    echo '{"ID":"3c8de1907aa5","CPUPerc":"1.20%","MemPerc":"1.40%","MemUsage":"112MiB / 8GiB"}'
    echo '{"ID":"b70f5d2ce913","CPUPerc":"0.60%","MemPerc":"3.80%","MemUsage":"304MiB / 8GiB"}'
    exit 0 ;;
  "volume ls")
    echo '{"Name":"acme_pgdata","Driver":"local","Size":"512MB"}'
    echo '{"Name":"acme_redisdata","Driver":"local","Size":"12MB"}'
    exit 0 ;;
  "network ls")
    echo '{"ID":"a1b2c3d4","Name":"acme_default","Driver":"bridge","Scope":"local"}'
    exit 0 ;;
  "compose ls")
    echo '[{"Name":"acme","Status":"running(3)","ConfigFiles":"/tmp/crafterm-demo/acme-web/compose.yml"}]'
    exit 0 ;;
  "inspect "*)
    echo '[{"Id":"9f21ac04b7d1","Name":"/acme-web","State":{"Status":"running","StartedAt":"2026-07-14T08:02:11Z"},"Config":{"Image":"acme/web:2.4.0","Env":["NODE_ENV=production","PORT=3000"]}}]'
    exit 0 ;;
  *) echo ''; exit 0 ;;
esac
`

export interface Stubs {
  CRAFTERM_GH_BIN: string
  CRAFTERM_DOCKER_BIN: string
}

export function writeStubs(ws: DemoWorkspace): Stubs {
  const gh = join(ws.binDir, 'gh')
  const docker = join(ws.binDir, 'docker')
  writeFileSync(gh, GH_STUB, { mode: 0o755 })
  writeFileSync(docker, DOCKER_STUB, { mode: 0o755 })
  return { CRAFTERM_GH_BIN: gh, CRAFTERM_DOCKER_BIN: docker }
}
