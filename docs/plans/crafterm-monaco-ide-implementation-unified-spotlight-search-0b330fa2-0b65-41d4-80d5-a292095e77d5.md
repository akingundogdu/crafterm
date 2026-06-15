# Unified Spotlight Search (tabbed "Search Everywhere")

## Context

Bugün arama/picker işlevi parçalı: ayrı ayrı `showCommandPalette` (cmd+shift+P),
`showFileFinder`, `showProjectPicker` (cmd+O), `showTerminalSwitcher` (cmd+shift+O),
`showFolderPicker` (cmd+P), `showClaudeDashboard`, `showRunAppsPicker` ve tabsiz bir
birleşik `showGlobalSearch` (cmd+J) modalları var. Kullanıcı bunların hepsini Cursor
görünümünde ama WebStorm "Search Everywhere" mantığında **tek bir tabbed spotlight**
altında istiyor: cmd+P ile açılan, üstünde sekmeler (All, Files, Commands, Claude,
Terminals, Shortcuts, Plans, Bookmarks, Apps, Tasks, Projects, Notebooks, Accounts)
bulunan, sekmeler arası dialog içinde geçiş yapılabilen, her sekmeye ayrıca doğrudan
kısayol atanabilen tek bir arama yüzeyi.

**Karar (kullanıcıyla netleşti):**
- Yeni tabbed spotlight **eklenir**, mevcut ayrı modallar **kaldırılmaz** (geriye dönük
  uyum + düşük risk). Ortak mantık paylaşılır, kod tekrarı kasıtlı olarak bırakılır.
- Açılış kısayolu **cmd+P** (`All` sekmesi). Eski `folder-picker` default'u cmd+P'den
  **cmd+alt+p**'ye taşınır. `global-search` (cmd+J) olduğu gibi kalır.
- Sekme seti: All + Files, Commands, Claude, Terminals, Shortcuts, Plans, Bookmarks,
  Apps, Tasks, Projects, Notebooks, Accounts.
- "Tasks" sekmesi üç kaynağı birleştirir: Daily Plan tasks + Reminders + Backlog
  (`~/.crafterm/todo-list.json`).

## Approach

Yeni bir modül: **`src/renderer/src/spotlight.ts`** → tek public fonksiyon
`showSpotlight(tabId?: string)`. Sekme bazlı, lazy-load eden bir model kurar; ağır
kaynakları (zsh komutları, dosya tarama) yalnızca o sekme ilk kez açıldığında yükler.

### Veri modeli

```ts
interface SpotEntry { label: string; detail?: string; badge?: SpotSource; run: () => void }
interface SpotTab {
  id: string                       // 'all' | 'files' | 'commands' | ...
  label: string
  load: () => SpotEntry[] | Promise<SpotEntry[]>
}
```

- Sekme içerikleri ilk aktivasyonda yüklenir ve dialog açıkken cache'lenir.
- `All` sekmesi **ucuz** kaynakların birleşimidir (mevcut `buildGlobalSearchIndex` +
  Shortcuts/Tasks/Apps eklenir). Pahalı kaynaklar (Files, Commands) `All`'a dahil
  edilmez; kendi sekmelerinde gösterilir. Bu davranış sekme altında küçük bir notla
  ("Files/Commands kendi sekmelerinde") belli edilir — sessiz kırpma yapılmaz.

### Sekme → kaynak eşlemesi (hepsi mevcut fonksiyonları reuse eder)

| Sekme | Kaynak / reuse | run() |
|---|---|---|
| All | `buildGlobalSearchIndex()` (pickers.ts:2540) + Shortcuts + Tasks + Apps | entry.open |
| Files | `window.crafterm.findFiles(folder, settings.explorerExclude)` (showFileFinder mantığı, pickers.ts:1489) `settings.commands.mdFolders` üzerinde | `openMarkdownFile(path)` |
| Commands | `loadZshCommands()` + `settings.paletteCommands` (pickers.ts:1633,1660) | aktif terminale `window.crafterm.input(id, value)` (insert) |
| Claude | `panes` içinde `p.claude` olanlar (showClaudeDashboard mantığı, pickers.ts:586) | `selectPane(id)` / `resumeClaudeSession` |
| Terminals | tüm `panes` (gs 'pane' kaynağı) | `selectPane(id)` |
| Shortcuts | `KEYBINDINGS` (keybindings.ts:12) + `effectiveCombo`/`comboLabel` | `hooks.runShortcut(id)` (yeni indirection) |
| Plans | `window.crafterm.listPlans()` (DirEntry[]) + `pane.plans` (deduped) | `openMarkdownFile(path)` |
| Bookmarks | `settings.bookmarks` | `openLink` / `openNote` |
| Apps | `flattenProjects(state.tree)` → her project'in `applications` (catalog.ts:8, Application types.ts:408) | `showRunApp(project, app)` |
| Tasks | `settings.dailyPlan.tasks` + `settings.reminders` + backlog JSON | task→`showTaskForm`, reminder→`openReminderForm`, backlog→todo-list.json'u code pane'de aç |
| Projects | `flattenProjects` (+ features) | `splitProjectRight(p)` |
| Notebooks | `window.crafterm.nbTree()` | `openNote(path)` |
| Accounts | `settings.accounts` | accounts sidebar tab'ına geç |

### UI

- `overlayModal('picker-modal picker-modal-wide')` + `makeSearchInput` reuse edilir.
  Bu iki helper şu an pickers.ts'de **private** → `export` eklenir (iç çağrılar
  değişmez), `spotlight.ts` import eder.
- Üst şerit: sekme başlıkları (`.spot-tabs` > `.spot-tab`), aktif sekme `.active`.
  Görsel olarak mevcut `.md-filters`/`.md-chip` (style.css:2674) diline yakın yatay
  tab bar. Her tab başlığında varsa atanmış kısayol etiketi gösterilir.
- Satırlar: mevcut `.pick-row` + `All` sekmesinde `.gs-badge gs-<source>` rozetleri
  (style.css:649,656) reuse.
- Klavye:
  - `Tab` / `Shift+Tab` → sonraki/önceki sekme (dialog kendi keydown'ında yönetir;
    modal açıkken global shortcut'lar zaten `isModalActive()` ile bastırılıyor —
    main.ts:308).
  - `↑/↓` satır seçimi, `Enter` çalıştırır, `Esc` kapatır (mevcut picker deseni).
  - Sekme başlığına tıklama da geçiş yapar.
  - Dialog açıkken `spotlight-*` combo'ları okunur (`comboFromEvent`) ve eşleşen sekmeye
    canlı geçilir — böylece "her sekmenin kendi kısayolu" dialog içinde de çalışır.

### Kısayollar (keybindings.ts + main.ts)

- `keybindings.ts` `KEYBINDINGS`'e eklenir:
  - `spotlight` (label "Spotlight search", default `cmd+p`)
  - Sekme başına: `spotlight-files`, `spotlight-commands`, `spotlight-claude`,
    `spotlight-terminals`, `spotlight-shortcuts`, `spotlight-plans`,
    `spotlight-bookmarks`, `spotlight-apps`, `spotlight-tasks`, `spotlight-projects`,
    `spotlight-notebooks`, `spotlight-accounts` — **default `''`** (kullanıcı Settings →
    Shortcuts'tan atar; mevcut cmd+O/cmd+shift+P/cmd+shift+O ile çakışmayı önler).
  - `folder-picker` default `cmd+p` → `cmd+alt+p` (çakışma çözümü).
- `main.ts` `KEY_HANDLERS`'a:
  - `'spotlight': () => void showSpotlight()`
  - her `spotlight-<tab>': () => void showSpotlight('<tab>')`
  - `hooks.runShortcut` implementasyonu wire edilir (KEY_HANDLERS[id]?.()).

### Cross-module indirection (Shortcuts sekmesi için)

- `state.ts` `hooks` objesine `runShortcut?: (id: string) => void` placeholder eklenir
  (state.ts:184 deseni). `main.ts`'de gerçek implementasyon wire edilir (main.ts:140
  bölgesi). `spotlight.ts`, `KEYBINDINGS`/`effectiveCombo`/`comboLabel`'ı doğrudan
  `keybindings.ts`'den import eder (cycle yok), çalıştırmayı `hooks.runShortcut` ile yapar.

### Backlog (todo-list.json) erişimi

- Okuma: `window.crafterm.todoRead()` (preload api.d.ts:684, default path main'de çözülür)
  → JSON parse → item'lar (title + status) entry olur.
- Açma: item run() → todo-list.json'u Monaco code pane'de açar (`createCodePane`).
  Renderer'da mutlak path tutmamak için (proje kuralı) küçük bir IPC eklenir:
  `todoPath(): Promise<string>` — main/index.ts handler + preload/index.ts method +
  preload/api.d.ts imzası (3 edit lockstep). Bu, backlog'a anlamlı bir "aç" aksiyonu
  verir ve yeni absolute-path hardcode'u önler.

## Files

- **Yeni:** `src/renderer/src/spotlight.ts` (`showSpotlight`, tab model, kaynak loader'ları).
- `src/renderer/src/pickers.ts` — `overlayModal` + `makeSearchInput` (+ gerekiyorsa
  `buildGlobalSearchIndex`, `SOURCE_LABEL`, `loadZshCommands`) `export` edilir.
- `src/renderer/src/keybindings.ts` — yeni action id'leri; `folder-picker` default değişir.
- `src/renderer/src/main.ts` — `KEY_HANDLERS` girişleri; `hooks.runShortcut` wiring;
  `showSpotlight` import.
- `src/renderer/src/state.ts` — `hooks.runShortcut` placeholder.
- `src/renderer/src/style.css` — `.spot-tabs`, `.spot-tab(.active)` ve gerekli ufak
  stiller (mevcut picker/chip/badge stilleri reuse).
- `src/main/index.ts` + `src/preload/index.ts` + `src/preload/api.d.ts` — `todoPath()` IPC.

## Verification

1. Typecheck: `npx tsc --noEmit -p tsconfig.web.json` ve `-p tsconfig.node.json` (temiz).
2. `npm run build` başarılı.
3. `npm run dev` ile elle test:
   - cmd+P → spotlight `All` sekmesinde açılır; yazınca rozetli sonuçlar gelir.
   - `Tab`/`Shift+Tab` ve tab başlığına tıklama sekmeler arası geçer; ↑↓/Enter/Esc çalışır.
   - Her sekme doğru kaynağı gösterir ve Enter doğru aksiyonu yapar:
     Files→md açar, Commands→aktif terminale ekler, Claude/Terminals→pane seçer,
     Shortcuts→ilgili aksiyonu çalıştırır, Plans/Bookmarks/Notebooks→açar,
     Apps→uygulamayı çalıştırır, Projects→split açar, Accounts→sekmeye geçer,
     Tasks→task formu / reminder formu / backlog'u code pane'de açar.
   - Settings → Shortcuts'ta yeni `spotlight-*` aksiyonları görünür ve atanınca hem
     doğrudan açılış hem dialog içi sekme geçişi çalışır.
   - cmd+J eski global search'ün, cmd+shift+P komut paletinin, cmd+O proje picker'ının
     hâlâ çalıştığı doğrulanır (regresyon yok). `folder-picker` cmd+alt+p ile açılır.
```
