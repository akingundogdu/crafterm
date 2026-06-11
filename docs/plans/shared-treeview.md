# Plan: Unified TreeView component (terminal + notebook + database)

## Goal

Terminal sidebar, Notebook ve Database üç tarafı da **tek ortak** `treeview.ts`
component'ini kullansın. Component, terminaldeki **genel tree davranışlarını**
kapsasın (drag-drop, inline rename, color tagging, context menu, search/filter,
keyboard navigation, tree guides, expand/collapse, pin/section). Terminale özgü
zengin görseller (status dot, git branch, pane/plan alt-satırları, order-num)
**core'a gömülmez**; adapter extension slot'ları üzerinden enjekte edilir.

Ek hedef: ortak component'in **CSS'i ayrı dosyalara** çıkarılır (tek dev `style.css`
parçalanır), her modül kendi slot-CSS'ini taşır.

## Current state (özet)

- `treeview.ts` (261 satır) — adapter-pattern'li generic component. **Sadece
  database** kullanıyor. Var: expand/collapse, rename, dnd (before/after/inside),
  color, context menu, tree guides, `icon`/`iconClass`/`trailing`/`rowClass`,
  `onClick`/`onActivate`, `selectedId`. **Yok:** search/filter, keyboard nav,
  sections/headers, order-num, light (rebuild'siz) status update, alt-satır slot'u.
- `sidebar.ts` (1092 satır) — terminalin kendi inline renderer'ı. En zengin:
  status dot, detail/pane/plan alt-satırları, order-num (Cmd+1..9), pin + Pinned
  section, group/ungrouped header'ları (drag-to-group), crumb, tab badge, feature
  ikonu, search/filter, keyboard nav, `updateStatuses()` (rebuild'siz light update).
- `notebook.ts` (421 satır) — kendi inline renderer'ı. Var: expand/collapse,
  rename (prompt), search/filter, keyboard nav, hover action butonları, linked
  files section. **Yok:** drag-drop, context menu, color.
- `buildGuides()` **3 yerde duplicate** (treeview.ts:44, sidebar.ts:597, notebook.ts:18).
- CSS: hepsi `src/renderer/src/style.css` (4099 satır). Tree stilleri **236–771**
  (ortak: `.tab-item`, `.tab-row`, `.row-guides`, `.guide-*`, `.tri`,
  `.folder-icon`, `.has-color`, `.drag-*`, `.rename-input`, `.tab-title`,
  `.section-label`/`.group-header`; terminal-özel: `.status-dot`, `.tab-sub`,
  `.tab-panes`, `.tab-plans`, `.tab-crumb`, `.tab-badge`, `.order-num`,
  `.pin-badge`; notebook: `.nb-*`; database: `.db-*` ~2950+).
- CSS import noktaları: `main.ts:2` ve `popout.ts:2` (`import './style.css'`).
  Vite, `.ts`'ten `import './x.css'` ile CSS bundle eder.

## Design decisions

1. **Core generic kalır.** Terminale özgü görseller adapter slot'ları ile gelir.
   Yeni opsiyonel `TreeAdapter` alanları:
   - `leading?(node): HTMLElement | null` — label'dan önce (status dot vb.).
   - `below?(node): HTMLElement | null` — satırın altına eklenen blok
     (detail satırı + pane listesi + plan listesi).
   - `numbered?: boolean` + `onNumber?(index, node)` — order-num rozeti / Cmd+1..9.
   - `hoverActions?(node): HTMLElement | null` — notebook hover butonları.
   - `pinned?(node): boolean` — Pinned section'a yerleştirme.
   - `sectionOf?(node): string | null` + `sectionHeader?(name)` — group/ungrouped
     header'ları (drag-to-group dahil; `onDropToSection?`).
2. **Search/filter core'da.** `view.setFilter(q)`; `adapter.label` üzerinden
   subtree "contains" eşleşmesi + ancestor koruma + filtre aktifken `collapsed`
   yok sayılarak force-expand. (Notebook'taki `pruneTree` davranışı genelleşir.)
3. **Keyboard navigation core'da.** Görünür düz liste (flat visible) tutulur;
   `view.handleKey(e)` arrow/enter, sol/sağ collapse, parent'a atlama. `view.selectFirst()`.
4. **Light update.** `view.updateRow(id)` / `view.refreshDynamic()` — DOM rebuild
   etmeden `leading`/`below`/`trailing` slot'larını yeniden hesaplar (terminal
   status polling için; mevcut `updateStatuses()` semantiği korunur).
5. **DnD semantiği.** Terminalin `DropMode` ('before'|'after'|'into') ile
   treeview'in `DropPos` ('before'|'after'|'inside') birleştirilir; tek tip
   ('inside') seçilir, `moveNode` çağrısı adapte edilir.
6. **CSS modülerleştirme.** Yeni `treeview.css` (ortak tree stilleri) `treeview.ts`
   içinde import edilir. Terminal-özel slot stilleri `sidebar.css`, notebook
   `notebook.css`, database `database.css` dosyalarına taşınır ve ilgili `.ts`
   modülünde import edilir. `style.css` sadece kalan global stilleri tutar.
   `main.ts`/`popout.ts` import zinciri korunur (modül import'ları Vite bundle'ına girer).

## Phases

### Faz 0 — treeview.ts'i genişlet (core)
- [ ] `TreeAdapter`'a yeni opsiyonel slot'lar: `leading`, `below`, `hoverActions`,
      `numbered`/`onNumber`, `pinned`, `sectionOf`/`sectionHeader`/`onDropToSection`.
- [ ] `rowOf`: `leading` slot'unu label'dan önce, `below` slot'unu satır altına,
      `hoverActions`/order-num rozetini ekle.
- [ ] Search/filter: `setFilter(q)`, subtree match + force-expand + empty-hint.
- [ ] Keyboard nav: flat visible list, `handleKey(e)`, `selectFirst()`,
      `scrollSelectedIntoView()`.
- [ ] Sections: pinned section + `sectionOf` gruplama + header (drag-to-section).
- [ ] Light update API: `updateRow(id)` / `refreshDynamic()`.
- [ ] Empty-state hint render desteği.
- [ ] **CSS:** `treeview.css` oluştur, ortak blokları (style.css 236–771'den ortak
      olanlar) buraya taşı; `treeview.ts` içinde `import './treeview.css'`.
- [ ] Verify: `npx tsc --noEmit` (web+node), `npm run build`.

### Faz 1 — database.ts'i yeni API'lere uyarla (minimal)
- [ ] Yeni slot imzalarıyla uyumluluk (mevcut adapter zaten uyumlu olmalı).
- [ ] **CSS:** `db-*` bloklarını `database.css`'e taşı, `database.ts`'te import et.
- [ ] Verify: tsc + build + `npm run dev` (database tree davranışı bozulmadı).

### Faz 2 — notebook.ts'i ortak component'e taşı
- [ ] `NbNode` için `TreeAdapter` yaz (icon/label/children/collapsed/onToggle/onActivate).
- [ ] Rename → adapter `onRename` (inline edit; mevcut prompt yerine).
- [ ] Hover action butonları (＋/🗀/⤴/✎/✕) → `hoverActions` slot'u.
- [ ] Linked files section → `pinned`/section veya ayrı üst blok.
- [ ] Search/filter ve keyboard nav core'dan; `notebook.ts`'teki `pruneTree`,
      `handleNotebookKey`, `buildGuides` kaldırılır.
- [ ] `sidebar.ts`'in notebook'a delege ettiği fonksiyonlar (`nbApplyQuery`,
      `handleNotebookKey`, `notebookSelectFirst`) yeni API'ye bağlanır.
- [ ] **CSS:** `nb-*` bloklarını `notebook.css`'e taşı, `notebook.ts`'te import et.
- [ ] Verify: tsc + build + dev (notebook: aç/oluştur/rename/sil/ara/klavye).

### Faz 3 — terminal sidebar.ts'i ortak component'e taşı
- [ ] `SidebarNode` için `TreeAdapter` (tab/folder/project).
- [ ] `leading` = status dot; `below` = detail + pane list + plan list;
      `numbered` = order-num (Cmd+1..9, `activateRowByNumber`);
      `trailing`/badge = tab/folder badge + pin badge; crumb (Pinned'de group yolu).
- [ ] Pinned section + group/ungrouped header'ları (`sectionOf` + drag-to-group).
- [ ] Light status update → `view.refreshDynamic()` (mevcut `updateStatuses()` yerine).
- [ ] `commands.ts` köprüleri: `moveNode`/`selectNode`/`toggleCollapse`/
      `setNodeColor`/`setNodeName`/`togglePin`/... adapter callback'lerine bağlanır.
- [ ] Feature/worktree ikonu `icon`/`iconClass` slot'unda.
- [ ] `sidebar.ts`'in kendi `renderNode`/`buildTabRow`/`buildFolderRow`/
      `buildGuides`/`wireDnd`/`startRename` kodu kaldırılır; orchestration
      (search bar, mod değişimi, resize, font) kalır.
- [ ] **CSS:** terminal-özel slot blokları (`.status-dot`, `.tab-sub`, `.tab-panes`,
      `.tab-plans`, `.tab-crumb`, `.tab-badge`, `.order-num`, `.pin-badge`) →
      `sidebar.css`, `sidebar.ts`'te import et.
- [ ] Verify: tsc + build + dev (en kapsamlı manuel test — aşağıdaki checklist).

### Faz 4 — temizlik
- [ ] `buildGuides` tek kaynak (treeview.ts) — diğer kopyalar zaten kalktı, doğrula.
- [ ] Ölü kod / kullanılmayan import temizliği.
- [ ] `style.css`'te taşınan blokların kaldırıldığını ve çift tanım kalmadığını doğrula.
- [ ] Final: tsc (web+node) + build + dev tam regresyon.

## Verification checklist (Faz 3 manuel — kritik davranışlar)
- Drag-drop: before/after/into; root'a bırakma; group header'a bırakma.
- Inline rename (dblclick + Cmd+Shift+R); Escape iptal.
- Color tagging (context menu swatch).
- Context menu öğeleri (tab/folder/project ayrı setler).
- Search/filter + "No matches"; arrow-down ile listeye geçiş.
- Keyboard nav: yukarı/aşağı/sol/sağ/Enter; Cmd+1..9.
- Pin/unpin + Pinned section + crumb.
- Group header'ları + Ungrouped + drag-to-group.
- Status dot canlı güncelleme (komut çalışırken rebuild olmadan).
- Detail/pane/plan alt-satırları (chevron toggle).
- Tree guides hizası; tüm collapse/expand.
- Pop-out penceresinde stiller (CSS import zinciri popout.ts'te de çalışıyor).

## Risks
- **Light update / status polling performansı** — sık poll'da rebuild'den kaçınmak
  şart; `refreshDynamic()` sadece slot DOM'unu güncellemeli.
- **Section render** — terminalin pinned + group + ungrouped orchestration'ı
  generic section modeline doğru oturmalı (drag-to-section dahil).
- **DnD semantiği** — `DropMode` ↔ `DropPos` ('into'/'inside') eşlemesi.
- **Keyboard focus / scroll** — rebuild sonrası seçim ve scroll korunmalı.
- **CSS bölme regresyonu** — taşınan selektörlerin pop-out dahil her surface'te
  yüklendiğinden emin olunmalı; çift tanım / sıralama (cascade) sorunları.

## Out of scope
- Terminale özgü mantığın (status hesaplama, git branch, plan dosyası okuma,
  pane sayımı) core'a taşınması — bunlar adapter callback'lerinde kalır.
- Yeni dependency eklenmesi.
