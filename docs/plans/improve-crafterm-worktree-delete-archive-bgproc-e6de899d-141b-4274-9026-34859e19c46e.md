# Worktree delete/create → background process + archive visibility fix

Branch: `improve-crafterm` · Slug: `worktree-delete-archive-bgproc`

## Problem

Bir worktree üzerine sağ tıklayıp "Delete worktree" yapıldığında git worktree
siliniyor ama sidebar listesinden gitmiyor. Ayrıca create/delete işlemleri
görünür yeni bir terminal tab'ı açıyor.

## Root causes (3)

1. **Bug B (asıl neden):** `passesArchiveFilter` (`sidebar.ts:995`) yalnızca
   `tab` node'larını archived iken gizliyor; worktree node'u için normal
   görünümde her zaman `true` döndürüyor. Worktree archive olsa bile listeden
   gitmiyor.
2. **Bug A:** reconcile archive guard `allTabs([n]).length === 0`
   (`worktrees.ts:96`) worktree'nin altında canlı terminal tab'ı varsa archive'ı
   blokluyor — silinen worktree genelde bu durumda.
3. **UX:** `newWorktree` / `removeWorktree` → `runInDir` → `createTab(null, …)`
   ile Free alanda görünür bir terminal açıyor; hidden background process değil.

## Refresh interval (bilgi)

Reconcile her **20 sn** (`RECONCILE_INTERVAL_MS`) + işlem sonrası tek seferlik
(silmede 2.5 sn, oluşturmada 3.5 sn). Bu plan ile işlem bitişi exit-code ile
yakalanacağı için bu sabit gecikmelere bağımlılık azalır.

## Decisions (kullanıcı)

- **Create:** gizli background process **proje node'u altında** "creating…"
  satırı olarak görünsün; bitince reconcile gerçek worktree node'unu üretsin.
- **Delete:** gizli remove arka planda koşsun; **koşarken** worktree node'u
  **üzeri çizili + loading/“archiving” göstergesi** ile görünsün; başarıyla
  bitince node + altındaki ölü tab'lar archive olsun; başarısızsa görsel geri
  alınsın + bildirim.

## Changes

### 1. `types.ts`
- `ProjectNode`'a `processes?: BackgroundProcess[]` ekle (create işleminin gizli
  process'ini proje tutsun).
- `WorktreeNode`'a transient `archiving?: boolean` ekle (strikethrough + spinner
  görselini sürer; final durum yine `status: 'archived'`).

### 2. `bgproc.ts` — holder'ı genelleştir + exit-await + cwd override
- `type ProcHolder = WorktreeNode | ProjectNode`.
- `findProcess`: hem worktree hem project node'larının `processes`'inde arasın
  (`{ holder, proc }` döndürsün).
- `startBackgroundProcess(holder, spec)`: `spec.cwd` opsiyonel olsun (default:
  worktree → `worktreePath`, project → `path`). `holder.processes`'e push etsin.
- Exit-await registry: `Map<stableId, (code:number)=>void>`; yeni
  `runHiddenAndWait(holder, spec): Promise<number>` process'i başlatıp exit
  code ile resolve etsin. `onProcessExit(id, code)` registry'i çözsün.
- `openProcessView`: `found.wt` → `found.holder` (fallback tab project altına da
  düşebilir; mevcut davranış korunur).

### 3. `main.ts`
- `window.crafterm.onProcExit((id, code) => onProcessExit(id, code))` — code'u
  geçir (şu an düşürülüyor, `main.ts:200`).
- Restore normalize (`main.ts:446` civarı): yüklemede `wt.archiving = false`
  yap (yarıda kapanma takılı kalmasın).

### 4. `worktrees.ts` — background create/delete + explicit archive
- Yeni `archiveWorktreeNode(wt)`: alt canlı tab'ları archive et (commands.ts'ten
  export edilecek `archiveTab` ile), `wt.status = 'archived'`,
  `wt.archiving = false`, `requestSidebar()` + `saveSoon()`.
- `newWorktree`: `runInDir` yerine **proje** altında
  `runHiddenAndWait(project, { title:'creating <branch>…',
  command:'git worktree add …', cwd: repo, role:'shell' })`; exit 0 →
  `reconcileWorktrees()` + create satırını kaldır; hata → satırı failed bırak +
  bildirim.
- `removeWorktree`: confirm sonrası `wt.archiving = true` + `requestSidebar()`
  (anında çizik + spinner). **Worktree node'u** altında
  `runHiddenAndWait(wt, { title:'removing…', command:'git worktree remove …',
  cwd: repo })`. exit 0 → `archiveWorktreeNode(wt)`; exit ≠ 0 →
  `wt.archiving = false` + `requestSidebar()` + failure bildirimi.
  (Not: `git worktree remove` kirli ağaçta `--force` olmadan başarısız olur;
  veri kaybı riski nedeniyle force eklenmez, hata bildirimle yüzeye çıkar.)
- reconcile guard (Bug A): `allTabs([n]).length === 0` koşulunu kaldır; gone &&
  not archived ise `archiveWorktreeNode(n)` çağır (alt tab'ları da archive eder).

### 5. `sidebar.ts` — görünürlük + görsel + project process satırları
- **Bug B fix:** `passesArchiveFilter` worktree'yi de kapsasın:
  - normal: `tab → !isArchivedTab(n)`; `worktree → n.status !== 'archived'`;
    diğer container → `true`.
  - archived view: archived worktree'leri de yüzeye çıkar
    (`n.status === 'archived'` veya `hasArchivedDescendant`).
- `rowClass`: `n.kind==='worktree' && n.archiving` ise `'worktree-archiving'`
  sınıfı ekle.
- `buildBelow`: process satırlarını project node'ları için de render et
  (`buildWorktreeProcesses`'i `holder.processes` üzerinden genelleştir) —
  "creating…" satırı proje altında görünsün.

### 6. `style.css`
- `.worktree-archiving` row label: `text-decoration: line-through; opacity:.6` +
  küçük CSS-only spinner.

## Verification
1. `npx tsc --noEmit -p tsconfig.web.json` ve `-p tsconfig.node.json`.
2. `npm run build`.
3. `npm run dev`:
   - Delete worktree → node anında çizik + spinner, görünür terminal açılmaz;
     remove bitince node listeden gider; "Show archived items" altında görünür.
   - Create worktree → proje altında "creating…" satırı, görünür terminal yok;
     bitince yeni worktree node'u belirir.
   - Delete failure (kirli ağaç) → çizik geri alınır + bildirim.
