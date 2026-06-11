# Daily Plan: terminal ↔ ticket entegrasyonu + custom date picker

## Context

Daily plan üzerinde bir görevin "▶ Open in terminal" butonuna basınca lokal bir
issue key (ör. `CRF-12`) atanıyor ve terminal o key ile açılıyor
(`openTaskInTerminal`, `dailyPlan.ts:122`). Ancak:

- Bağlı issue key terminalde belirgin değil. Header'da zaten bir
  `.pane-daily-chip` var (`pane.ts:169`) ama drag grip'inin **sağında** ve
  kullanıcı fark etmiyor. İstenen: key'i grip'in **soluna** almak ve yalnızca
  issue key varsa göstermek.
- Issue'yu "done" yapmanın tek yolu pane'i kapatıp çıkan "Mark task done?"
  dialog'unu onaylamak (`commands.ts:940`). Terminali açıkken hızlı bir yol yok.
- "Open in terminal" görevin status'unu değiştirmiyor; kullanıcı manuel
  In Progress'e çekmek zorunda.
- Görev formundaki **Project** dropdown'u layout bug'ı yüzünden dar/bozuk
  görünüyor (`dailyPlan.ts:1004`).
- Tüm tarih girdileri native `<input type="date">` / `datetime-local`; açılan
  takvim Chromium'un native popup'ı ve app'in koyu temasıyla uyumsuz, CSS ile
  temalanamıyor.

Amaç: terminal ile ticket arasındaki bağı görünür/eyleme dönük yapmak ve tüm
tarih girdilerini tema ile uyumlu, yeniden kullanılabilir bir component'e
taşımak.

## Scope (kullanıcı kararları)

- Header key göstergesi: **sadece issue key**, yalnızca terminal bir ticket'tan
  açıldıysa (issueKey mevcutsa). Key'siz atanmış görevlerde gösterilmez.
- "View ticket detail" → mevcut `showTaskForm` modalını açar.
- "Mark as done" → `status='done'`, pane **açık kalır**.
- Date picker: **custom temalı popover** (vanilla, yeni bağımlılık yok).
- Kapsam: **tüm** tarih girdileri (daily plan form + header, meeting notes,
  reminders datetime-local).

---

## A. Header: issue key göstergesi (grip'in solunda)

**Dosya:** `src/renderer/src/pane.ts`

1. `setupPaneDnd` (`pane.ts:73`): grip'i `.pane-title`'dan sonra değil, varsa
   `.pane-daily-chip`'ten sonra ekle — böylece DOM sırası
   `htitle, taskChip, grip, menuBtn, close` olur ve chip grip'in soluna düşer.
   ```ts
   const anchor = header.querySelector('.pane-daily-chip') ?? header.querySelector('.pane-title')
   anchor?.insertAdjacentElement('afterend', grip)
   ```
2. `refreshPaneDailyTask` (`pane.ts:383`): chip'i yalnızca atanmış görevin
   **issueKey**'i varsa göster. Yeni `paneActions.dailyTaskIssueKey(taskId)`
   hook'unu kullan; key yoksa chip gizli kalır. Metni `◎ CRF-12` yerine sade
   `CRF-12` yap (issue key vurgusu).
3. Chip click davranışı: `assignDailyTask` yerine `paneActions.viewTicketDetail`
   (ticket'a tıklayınca detay açılır; assign/change artık action menüde).

**Yeni hook:** `state.ts` `paneActions`'a `dailyTaskIssueKey: (taskId) => string | null`
ekle; `main.ts`'te `dailyPlan` export'una bağla.

## B. Action menu: "Daily task" section

**Dosya:** `src/renderer/src/pane.ts` — `buildPaneMenu` (`pane.ts:425-432`)

Mevcut tek "Assign to daily task…" item'ını bir section ile değiştir:

- Görev atanmışsa (`pane.dailyTaskId` set):
  - `section('Daily task')`
  - `item('View ticket detail', () => paneActions.viewTicketDetail(paneId))`
  - status `!== 'done'` ise: `item('Mark as done', () => paneActions.markTaskDone(paneId))`
  - `item('Change task…', () => paneActions.assignDailyTask(paneId))`
- Atanmamışsa: mevcut `item('Assign to daily task…', …)` korunur.

**Yeni hook'lar:** `state.ts` `paneActions`'a
`viewTicketDetail: (paneId) => void` ve `markTaskDone: (paneId) => void` ekle;
`main.ts`'te `dailyPlan`'daki yeni export'lara bağla.

**Dosya:** `src/renderer/src/dailyPlan.ts` — yeni export'lar:
- `viewPaneTask(paneId)`: `panes.get(paneId)?.dailyTaskId` → `taskById` →
  `showTaskForm(task, () => activeDailyRerender?.())`.
- `markPaneTaskDone(paneId)`: görevi bul, `status='done'`, `updatedAt`,
  `saveSoon()`, `refreshPaneDailyTask(paneId)`, `activeDailyRerender?.()`.
- `dailyTaskIssueKey(taskId)`: `taskById(taskId)?.issueKey ?? null`.

## C. "Open in terminal" → otomatik In Progress

**Dosya:** `src/renderer/src/dailyPlan.ts` — `openTaskInTerminal` (`:122`)

Key atandıktan ve terminal açılmadan önce, görev `done` değilse status'u `wip`
yap:
```ts
if (task.status !== 'wip') { task.status = 'wip'; task.updatedAt = Date.now(); saveSoon() }
```
`onChange()` zaten çağrılıyor (board'u günceller).

## D. Project dropdown layout fix

**Dosya:** `src/renderer/src/dailyPlan.ts` (`:986-1013`) + `style.css`

Sorun: `.field` yatay flex satırı (`label | control`), ama project alanı
`label | select | proj-hint` üç çocuk içeriyor → select sıkışıyor, path hint'i
yanda kalıyor. Düzeltme: select + hint'i dikey bir sarmalayıcıya al:
```ts
const projCol = document.createElement('div')
projCol.className = 'field-control-col'
projCol.append(projSel, projHint)
projField.append(projCol)   // label | projCol
```
CSS (`style.css`, `.field` blokları civarı ~3450):
```css
.field-control-col { flex: 1; max-width: 280px; display: flex; flex-direction: column; gap: 4px; }
.field-control-col select { width: 100%; max-width: none; }
.field-control-col .daily-plan-proj-hint { margin-top: 0; }
```
Sonuç: project select Status/Priority/Date ile aynı genişlik, hint altında.
(Meeting notes project alanında hint yok — etkilenmez.)

## E. Custom themed date picker component

**Yeni dosya:** `src/renderer/src/datepicker.ts`

Drop-in API (mevcut çağrı yerleri `.value` ve `change` kullanıyor):
```ts
export function createDateField(opts: {
  mode: 'date' | 'datetime'
  value?: string            // 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:mm'
  className?: string
}): HTMLElement   // .value get/set property + 'change' event dispatch eder
```
Davranış:
- Dönen element bir trigger button (formatlı tarih + takvim glyph; boşsa
  placeholder). `Object.defineProperty(el, 'value', {get,set})` ile native
  input gibi `.value` okunur/yazılır; programatik set (reminders preset'leri)
  display'i günceller, `change` fire **etmez** (native davranışla aynı).
- Click → body'ye eklenen `.date-pop` popover (konum: trigger'ın
  `getBoundingClientRect()` altı; `showPaneMenu` paterni). İçerik: ay/yıl
  başlığı + önceki/sonraki ay okları, Mon–Sun haftalık satırı, 6 haftalık gün
  ızgarası, bugün ve seçili gün vurgusu, footer'da Clear / Today.
- `mode==='datetime'`: ızgaranın altında bir saat satırı (styled
  `<input type="time">` — büyük native popup'ı yok). Değer
  `YYYY-MM-DDTHH:mm` formatında birleşir.
- Gün seçilince internal state güncellenir, trigger metni yenilenir,
  `el.dispatchEvent(new Event('change'))` çağrılır, popover kapanır
  (datetime'da saat değişimi popover'ı kapatmaz).
- Tarih parse/format yerelde yapılır (date-only için `new Date(str)` UTC
  kaymasından kaçınmak üzere parçalardan kurulur). Dışarıdan dış-tık / Esc ile
  kapanır.

**CSS (`style.css`):** `.date-pop`, `.date-pop-head`, `.date-pop-grid`,
`.date-pop-cell` (`.is-today`, `.is-selected`, `.is-muted`), `.date-pop-foot`,
trigger için `.date-field` — mevcut `.context-menu` / `.field select` token'ları
(`var(--bg-term)`, `var(--border-strong)`, `var(--accent)`) ile uyumlu.

**Çağrı yerlerini değiştir (drop-in):**
- `dailyPlan.ts:980` (görev formu Date) → `createDateField({mode:'date', value})`.
- `dailyPlan.ts:478` (header nav) →
  `createDateField({mode:'date', value:selectedDate, className:'daily-plan-date-input'})`;
  mevcut `change` listener aynen çalışır.
- `meetingNotes.ts:261` → `createDateField({mode:'date', value})`.
- `reminders.ts:305` → `createDateField({mode:'datetime', value, className:'reminder-input'})`;
  preset `when.value = toLocalInput(...)` çalışmaya devam eder.

`color-scheme: dark` ve `::-webkit-calendar-picker-indicator` kuralları artık
kullanılmayan native date input'lar için kalabilir (zararsız) ya da
sadeleştirilebilir.

---

## Touched files

- `src/renderer/src/pane.ts` — grip konumu, `refreshPaneDailyTask`, `buildPaneMenu`, chip click
- `src/renderer/src/dailyPlan.ts` — `openTaskInTerminal` (wip), yeni export'lar, project field, date field
- `src/renderer/src/meetingNotes.ts` — date field
- `src/renderer/src/reminders.ts` — datetime field
- `src/renderer/src/state.ts` — `paneActions` tip eklemeleri (3 hook)
- `src/renderer/src/main.ts` — yeni `paneActions` wiring
- `src/renderer/src/datepicker.ts` — yeni component
- `src/renderer/src/style.css` — project field fix + date picker stilleri

Persistence şeması değişmiyor (`task.status`, `task.issueKey`, `pane.dailyTaskId`
zaten mevcut/persist ediliyor).

## Verification

1. Typecheck: `npx tsc --noEmit -p tsconfig.web.json` ve `-p tsconfig.node.json`.
2. `npm run build`.
3. `npm run dev` ile çalıştır (mevcut çalışan instance'ı kapatma — önce sor):
   - issueKeyPrefix'i olan bir projeye bağlı bir görevde ▶ Open in terminal:
     görev **In Progress**'e geçer, terminal açılır, header'da grip'in
     **solunda** issue key görünür.
   - Pane ⋯ menüsünde **Daily task** section'ı: "View ticket detail" formu açar,
     "Mark as done" görevi Done'a taşır (pane açık kalır, board güncellenir).
   - Görev formunda **Project** dropdown'u Status/Priority/Date ile aynı
     genişlikte; path hint'i altında.
   - Dört yerde de (görev formu, header nav, meeting notes, reminders) tarih
     alanına tıklayınca **temalı custom takvim** açılır; reminders'ta saat
     seçimi çalışır; presetler hâlâ değeri günceller.
   - Regresyon: seçilen tarihler doğru kaydediliyor (timezone kayması yok),
     header navigasyonu ve ‹/›/Today butonları çalışıyor.
