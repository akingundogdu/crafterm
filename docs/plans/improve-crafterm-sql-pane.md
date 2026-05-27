# Plan: SQL query as a pane (modal → pane refactor)

Branch: `improve-crafterm`
Slug: `sql-pane`

## Goal

Database query ekranını modal'dan çıkar, **terminal/browser/doc pane gibi** birinci sınıf
pane'e dönüştür:

- "Run a SQL query" artık modal değil; **split bir pane**te çalışır, ekran genişliğinin
  tamamını kullanır.
- Cmd+D **bağlama duyarlı** olur: sidebar Database tab'inde ise yeni SQL pane,
  değilse mevcut davranış (terminal split-right).
- Database treeview'da bir Table/View/Procedure veya saved query'e tıklama yine yeni
  bir SQL pane açar (modal yerine).
- SQL pane içeriği (connection id + SQL kodu) restart sonrası geri yüklenir.

## Current state

- `database.ts:579` — `openQueryEditor(opts)` modal kuruyor (`.modal db-query-modal`).
  İçinde: connection select, Run/Save toolbar, CodeMirror SQL editor (`sqlEditor.ts`),
  result grid. Çağıran 4 yer var:
  - `onActivate` → Table/View/Procedure tıklamada: `SELECT * FROM x LIMIT 100;`
    + auto-run (`database.ts:290`)
  - `query` rowu açmak: saved .sql dosyasını okuyup modal'a basıyor (`:153–157`)
  - "New query" context menü (`:322, :338`)
- Pane tipleri: `panes` (terminal), `browsers` (webview), `docs` (markdown).
  `content.ts:35` bir leaf paneId için sırayla `panes/browsers/docs` map'lerinden el
  arıyor.
- Cmd+D = `split-right` action = `splitActivePane('row')` (`main.ts:201`,
  `keybindings.ts:22`).
- Sidebar mode bilgisi: `isDatabaseMode()` (`sidebar.ts:305`).
- Layout serialize: `state.ts:203 serializeLayout()` her leaf için terminal-specific
  alanlar (`cwd`, `claude`, …) yazıyor. `SavedLeaf` (`preload/api.d.ts:2`) genişletilebilir.

## Design

### Yeni pane tipi: `SqlPane`

- `types.ts`'e ekle:
  ```ts
  export interface SqlPane {
    id: string
    el: HTMLElement      // persistent .pane-box (header + editor + result)
    connId: string | null
    fileName: string | null    // saved .sql file (null = unsaved)
    getCode(): string          // current editor value (for serialize)
  }
  ```
- `state.ts`: `export const sqlPanes = new Map<string, SqlPane>()`

### Pane fabrikası: `dbPane.ts` (yeni modül)

- `createSqlPane(opts: { connId?: string; sql?: string; fileName?: string; autoRun?: boolean }): string`
  - Mevcut `openQueryEditor` içindeki toolbar + editor + result kodu **birebir taşınır**
    ama overlay/modal yerine `.pane-box.sql-pane` DOM'a basılır.
  - Header: `pane-title` ("SQL · {conn name}"), Run/Save butonları, pane-close, +
    DnD/select wiring (`setupPaneDnd`, `paneActions.select`).
  - Body: 3 satır grid → toolbar (connection select + Run + Save) / editor
    (`createSqlEditor`) / result.
  - `sqlPanes.set(id, ...)`
- `destroySqlPane(id)` — sqlPanes.delete + (varsa) editor view destroy.
- Modülün dosya yapısı `pane.ts:createDocPane` (`pane.ts:500`) ile birebir aynı paterni
  izler; yeni modül açıyoruz çünkü `pane.ts` zaten 879 satır ve SQL editor/db logic
  bağımlılıkları (codemirror, db ipc) database tarafının bağımlılıkları.
- CSS yeni dosya: `dbPane.css` (style.css'i şişirmemek için, `shared-treeview` planının
  prensibi).

### `content.ts` entegrasyonu

- `content.ts:35`: lookup chain'e `sqlPanes.get(node.paneId)?.el` eklenecek (4.
  fallback).

### `commands.ts:closePane` entegrasyonu

- `commands.ts:811` close chain'e `else if (sqlPanes.has(paneId)) destroySqlPane(paneId)`
  eklenecek (terminal kill çağrısı yapılmaz).

### Cmd+D context-aware

- `main.ts:201`:
  ```ts
  'split-right': () => {
    if (isDatabaseMode()) void splitActiveWithSql()
    else void splitActivePane('row')
  }
  ```
- `commands.ts`'e yeni helper: `splitActiveWithSql()` → `createSqlPane({})` +
  `placeSplit(id, 'row')`. (`placeSplit` zaten browser/doc için kullanılıyor.)
- Aktif tab yoksa: yeni terminal tab açıp split etmek yerine yeni bir tab oluşturup
  içine SQL pane'i koy — `hostDoc` (`commands.ts:734`) ile aynı paterni izle.

### `database.ts` çağrılarının değişimi

- `openQueryEditor(opts)` fonksiyonu kaldırılır.
- Yerine `database.ts` → `commands.ts:openSqlInSplit(opts)` çağırır:
  - `onActivate` (Table/View/Procedure): `openSqlInSplit({ connId, sql: SELECT…,
    autoRun: true })`
  - saved query open: dosya okunur, `openSqlInSplit({ connId, sql, fileName })`
  - "New query" / "Preview": yine `openSqlInSplit({ connId, … })`
- Modal'a özgü close, makeCloseButton, modal-overlay vs. bu dosyadan kaldırılır.

### Persistance

- `preload/api.d.ts SavedLeaf`'e opsiyonel alan:
  ```ts
  sqlPane?: { connId: string | null; code: string; fileName: string | null }
  ```
- `state.ts:serializeLayout` — leaf bir SqlPane ise terminal alanları yerine
  `sqlPane = { connId, code: sp.getCode(), fileName }` yaz.
- Restore (main.ts'te yapılan layout deserialize). Şu an leaf restore'u terminal
  varsayıyor; tarayıp `restoreLayout`/`buildTab`/benzeri fonksiyonu bulup
  `leaf.sqlPane` varsa `createSqlPane(...)` ile pane id üret, terminal yarat**ma**.
  (Adım 8'de tam dosya/yer tespit edilecek.)

## Edge cases

- Connection silindiğinde açık SQL pane'i: `database.ts:menu` → `Delete conn` çağrısı
  `removeNode`+`dbDisconnect` yapıyor. SQL pane'in connSel'i ölmüş id'yi göstermesin
  → bağlantı listesi pane içinde state'ten **canlı** okunsun (modal'da `flattenConns()`
  bir kere çağrılıyor; pane'de her refresh'te tazelensin). En basit yöntem: header'daki
  select açılırken `flattenConns()` çağırmak.
- Cmd+D'nin Database mode'da terminal split etmesi engelleniyor — kullanıcı bunu
  yine istiyorsa? Şimdilik kapsam dışı. (Açıkça istendi: "Database sekmesi seçili
  ise aynı shortcut çalışsın" → split-with-sql kastedildi.)
- Pop-out: pane.ts'in `popOutPane` yalnız terminal pane'leri destekliyor; SQL pane
  pop-out kapsam dışı (şimdilik).
- Hot-reload edilen schema autocomplete: modal'daki `syncEditorTo`/`schemaFor`/
  `objCache` mantığı aynen taşınır.

## Implementation steps

1. **types.ts** — `SqlPane` interface.
2. **state.ts** — `sqlPanes` map.
3. **dbPane.ts (yeni)** — `createSqlPane` (modal'dan taşıma) + `destroySqlPane`.
4. **dbPane.css (yeni)** — pane shell + toolbar + grid stilleri (`db-query-*`
   stillerini `database.css`'ten dolaşacak şekilde refactor: ortak grid stilleri
   ortak kalır; pane shell'i için yeni `.sql-pane *` selektörleri).
5. **content.ts** — buildNode lookup chain'ine sqlPanes.
6. **commands.ts** — `splitActiveWithSql()` + `openSqlInSplit(opts)` + closePane'de
   destroy chain.
7. **database.ts** — `openQueryEditor`'ı kaldır, çağrıları `openSqlInSplit`'e çevir.
   modal CSS sınıflarına olan referansları temizle.
8. **main.ts** — `split-right` action context-aware.
9. **preload/api.d.ts** — `SavedLeaf.sqlPane?`.
10. **state.ts serializeLayout** — sql pane serileştirme.
11. **Layout restore** (dosya 8. adımda tespit edilecek) — `leaf.sqlPane` varsa
    `createSqlPane` ile yeniden oluştur.
12. **Typecheck + dev test** — `npx tsc --noEmit -p tsconfig.web.json` ve
    `tsconfig.node.json`; `npm run dev` ile her senaryo: (a) Cmd+D terminal mode →
    terminal split; (b) Cmd+D database mode → SQL pane split; (c) Table tıkla →
    auto-run SQL pane; (d) saved query aç; (e) save .sql; (f) restart → SQL pane
    geri yüklendi mi.

## Out of scope

- SQL pane'in pop-out window'da açılması.
- Birden çok tab açıkken hangi tab'da SQL pane'in açılacağına dair yeni picker.
- Result grid'in tab/csv export'u (mevcut da yok).
- SQL pane içindeki history / multi-query separator (mevcut Run zaten tek statement
  modunda; değişmiyor).
