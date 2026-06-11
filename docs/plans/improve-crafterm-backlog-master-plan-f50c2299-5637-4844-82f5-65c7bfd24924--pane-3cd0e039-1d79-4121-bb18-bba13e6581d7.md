# Crafterm — Backlog Master Plan

> **Bu dosya hem planı hem implementasyonu yönetir.** Tüm açık backlog
> maddeleri burada bölüm bölüm toplanmıştır; her madde için teknik notlar,
> bağımlılıklar ve **netleşmeden başlamayacağımız açık sorular** vardır.
> Önce soruları yanıtlarız → maddeyi `In progress` yaparız → bitince
> `Ready to test`. Backlog JSON (`~/.crafterm/todo-list.json`) tek gerçek
> kaynak olarak kalır; bu dosya onun üstüne planlama/uygulama katmanıdır.

- **Branch:** `improve-crafterm`
- **Session:** `f50c2299-5637-4844-82f5-65c7bfd24924`
- **Pane:** `3cd0e039-1d79-4121-bb18-bba13e6581d7`
- **Kapsam:** 24 backlog maddesi + UNIFIED DATA MODEL temeli (F1–F6).

---

## ⭐ GÜNCEL DURUM (Snapshot — son güncelleme bu turda)

**Temel fazlar (§2.6):**
| F1 | F2 | F3 | F4 | F5 | F6 |
|----|----|----|----|----|----|
| ✅ test edildi | ✅ | ✅ **test edildi** | ✅ | ✅ | ✅ |

> **Tüm temel fazlar (F1–F6) implement edildi.** F4: controlled Claude launch'ları artık `--session-id == pane.stableId` kullanıyor → tek UUID (pane = plan dosyası tag'i = Claude session). Capture polling (`claudeLatestSession`) yalnızca **kullanıcının elle yazdığı** `claude` için fallback olarak kalıyor (o komutu kontrol edemeyiz).

**Backlog maddeleri:**
- 🟩 **Ready to test:** iOS run UI (todo20/21/22) · daily kolay (todo9/8/12) · iOS cluster (todo16/17/24/**23**) · daily cluster (todo14, todo6, todo7, todo5, todo4, todo47≡13)
- ⏸ **Bloke (1):** **todo49** (paylaşımlı web UI — todo61/sync gerektirir)
- ⬜ **Açık (6 madde):** Search/Agent (todo25, todo2, todo3) · Büyük (todo1, todo61, todo68)
  - *todo49 → todo61 (sync) bağımlı. todo23: env inject + global skill; restore edilen worktree terminalleri env taşımaz (yeniden aç).*

**⚠️ Doğrulama bekleyen (dev'de test edilmeli):** F1, F2, F5, F6 + iOS run UI. *(F3 test edildi.)*

**Foundation'ın backlog'a etkisi (doğrula):**
- **todo47≡todo13** (ticket↔terminal persistence) → F1–F3 ile büyük ihtimalle **zaten çözüldü**; ayrıca kod yazmadan dev'de doğrula.
- **todo17** (files worktree path) → F5 ile worktree artık birinci-sınıf node (`worktreePath`); cwd çözümü tek noktada düzeltilebilir, küçük iş.

**Önerilen sonraki adım:** Temel (F1–F6) tamam. (1) dev'de F4/F5/F6+iOS test → (2) 🟢 todo16+todo17 (iOS cluster'ı kapatır) → (3) 🟢 todo9/todo8/todo12 (daily plan kolay grubu) → todo47≡13'ü doğrula.

---

## 0. Bu dosya nasıl çalışır

Her maddenin bir **durum kutusu** vardır:

- `⬜ Backlog` — henüz başlanmadı
- `❓ Needs answers` — açık sorular yanıt bekliyor (başlayamayız)
- `🟦 In progress` — Claude implement ediyor
- `🟩 Ready to test` — bitti, kullanıcı doğrulayacak
- `✅ Done` — kullanıcı onayladı

**Kural:** `❓` işaretli her madde, "Açık Sorular" alt başlığındaki tüm sorular
yanıtlanana kadar `🟦`'ye geçemez. Soru = ben (Claude) varsayım yapmamak için
soruyorum; yanıt gelince notu bu dosyaya işler ve implementasyona geçerim.

---

## 1. Master Sıralama (kolay → zor)

| # | ID | Küme | Madde | Efor | Durum |
|---|----|----|----|----|----|
| 1 | todo9 | A | New-task modal title kutusunu büyüt | 🟢 saatler | 🟩 Ready to test |
| 2 | todo8 | A | Daily plan'da `Cmd+N` new-task açmıyor (bug) → modal kendi Cmd+N'i | 🟢 saatler | 🟩 Ready to test |
| 3 | todo12 | A | "Run in claude session" adı + `ultrathink ` prefix | 🟢 saatler | 🟩 Ready to test |
| 4 | todo16 | C | iOS worktree → `*.xcconfig.template` → `*.xcconfig` (Secrets dahil) | 🟢 saatler | 🟩 Ready to test |
| 5 | todo14 | A | Title yanında `(KEY)`, rename çalışsın | 🟡 1 gün | ❓ |
| 6 | todo47≡todo13 | A | Restart sonrası ticket↔terminal bağı kayboluyor (bug) | 🟡 1 gün | ❓ |
| 7 | todo7 | A | Task done → ilişkili workspace'i sil? | 🟡 1 gün | ❓ |
| 8 | todo5 | A | Project dropdown → treeview/menu component | 🟠 birkaç gün | ❓ |
| 9 | todo4 | A | Daily plan'a proje filtresi | 🟠 birkaç gün | ❓ |
| 10 | todo6 | A | "Terminalde aç"a create-worktree seçeneği (branch=key) | 🟠 birkaç gün | ❓ |
| 11 | todo17 | C | Worktree path algılama (files panel aktif worktree'yi takip eder) | 🟠→🟢 | 🟩 Ready to test |
| 12 | todo25 | B | Markdown chat → açık Claude session'a mesaj | 🟠 birkaç gün | ❓ |
| 13 | todo21 | C | Run-on-device → hidden **background process** (F6 üstünde) | 🔴 büyük | 🟩 Ready to test |
| 14 | todo20 | C | Device/simulator picker (`ios:listTargets`) + **scheme picker** (`ios:listSchemes`, local/prod → `IOSWT_SCHEME`) | 🔴 büyük | 🟩 Ready to test |
| 15 | todo22 | C | Play ▶ son seçimi (`worktree.lastRun`) çalıştırır, ilk run'a kadar disabled | 🔴 büyük | 🟩 Ready to test |
| 16 | todo23 | C | `/run-on-device <worktree>` skill | 🔴 büyük | ❓ |
| 17 | todo1 | E | VSCode-style IDE editör → files paneli | 🔴 büyük | ❓ |
| 18 | todo24 | C | Worktree'ler arası Swift package paylaşımı | 🟣 research | ❓ |
| 19 | todo2 | B | Spotlight (Cmd+P) tab'lı birleşik arama | 🟣 büyük | ❓ |
| 20 | todo3 | B | Cursor-style new-agent ekranı + plan-mode | 🟣 en büyük | ❓ |
| 21 | todo49 | A | Ticket'lar için web arayüzü (paylaşımlı) | 🟣 büyük | ❓ |
| 22 | todo61 | D | Account-bazlı online/GitHub storage sync | 🟣 en büyük | ❓ |
| 23 | todo68 | D | Mobil uygulama | 🟣 en büyük | ❓ |

---

## 2. Bağımlılık Haritası (özet)

```
A (Daily Plan)
  todo5 (treeview dropdown) ──> todo4 (proje filtresi)
  todo47≡todo13 (persistence) ──> todo7 (done'da sil) ──> todo6 (worktree aç)
  todo14 (title/key) ── aynı "ticket↔terminal" mekanizması ──> todo47/13
  todo49 (web UI) ──> todo61 (sync) gerektirir

B (Search/Agent)
  todo25 ("session'a mesaj" primitive) ──> todo3
  todo2 (spotlight) ──> todo3 (new-agent ekranı, claude-sessions sekmesi)

C (iOS Worktree)
  todo16 → todo17 (path bug, önkoşul) → todo21 → todo20 → todo22 → todo23
  todo24 bağımsız research

D (Cloud/Mobil)
  todo61 (sync) ──> todo68 (mobil), ──> todo49 (web)

E (IDE)
  todo1 bağımsız
```

**Kritik bulgu (kodda doğrulandı):** `dailyTaskId` **persist ediliyor** —
`state.ts:323` leaf'e yazıyor, `main.ts:438` restore ediyor, `api.d.ts:18`'de
alan mevcut. Yani todo47/todo13 "hiç saklanmıyor" değil; saklanıyor ama
restore/yeniden-bağlama yolunda kopukluk var. Tek bug olarak ele alınacak.

---

## 2.5 — UNIFIED DATA MODEL (stableId UUID hub) — TEMEL

> Bu bölüm tüm A/C kümesi todo'larının üstüne oturduğu **temel veri modeli**.
> Kullanıcıyla netleştirilen kararlar (A–G). Kodda doğrulandı; aşağıdaki şekil
> hedeftir, mevcut şemadan migration gerektirir.

### İlke: tek UUID = `stableId`

Her terminal/Claude pane oluşunca `crypto.randomUUID()` ile bir `stableId`
üretilir (zaten böyle — `pane.ts:144`). **Her şey bu UUID altında toplanır:**
plan dosyaları (`--pane-<stableId>`), Claude session, ticket(ler), worktree,
cwd, role. `stableId` shell'e `CRAFTERM_PANE_ID` olarak verilir.

**Claude session birleştirme (karar G):** Claude `claude --session-id <stableId>`
ile başlatılır → Claude'un session id'si = `stableId`. Restore `claude --resume
<stableId>`. Böylece `claudeSessionId` ayrı bir kavram olmaktan çıkar; tek id
her şeyi bağlar. Bu, mevcut yakalama mekanizmasını (`claudeSpawnedAt`,
`claudeSessionLocked`, `claudeLatestSession`, kardeş-session-karışması bug'ı)
**siler**. Migration: eski pane'ler yakalanmış `claudeSessionId` ile resume olur;
yalnızca yeni pane'ler `--session-id == stableId` kullanır.

### İlke: hiçbir şey silinmez → `status` (karar A, E)

`closePane`/`closeTab` artık tree'den **splice etmez**; PTY'yi kill eder ve node'u
`status: archived` yapar. Her node'da (pane + tab + worktree) `status` alanı:

`idle` · `running` · `waiting` · `done` · `archived`

- **`waiting`** = terminal/Claude soru sordu / input bekliyor (mevcut
  `claudeStatus: 'question'` ile eşleşir). `running` = busy/komut çalışıyor.
- **Pane:** beştanenin biri (gerçek durum).
- **Tab:** alt pane'lerden **türetilir** (öncelik: `waiting` > `running` >
  `idle`; hepsi `done` → `done`; hepsi `archived` → `archived`).
- **Worktree:** `active | archived` (birincil); UI'da içindeki `processes`'ten
  türetilen "running" göstergesi.

- **Sidebar:** varsayılan yalnızca `status !== archived` listeler.
- **Action menü:** "Show archived items" → yalnızca archived olanları listeler.
- JSON büyürse ileride bakılacak (şimdilik sınır yok).

### İlke: worktree birinci-sınıf tip, git ile birebir (karar B, F)

Worktree artık `kind: "folder" + worktreePath` marker değil, **`kind: "worktree"`**
ayrı tipi (ileride başka tipler de gelecek). Worktree bir container gibi davranır:
altında tab/pane tutabilir ("ikinci leaf").

**Git senkronu (kritik):**
- Crafterm'den delete → **gerçek `git worktree remove`** + node `status: archived`.
- Git worktree dışarıdan silinirse → `reconcileWorktrees` prune **etmez**, `archived` yapar.
- Tree, git'in aynasıdır; tüm worktree işlemleri git üzerinden.

### İlke: pane bağları çoklu + role'lü (karar C, D)

- **`tickets: string[]`** — bir pane birden fazla ticket'a bağlanabilir (karar C).
- **`role: 'claude' | 'app' | 'build' | 'shell'`** — pane'in tipi; her süreç
  bağımsız yönetilsin diye (karar D).

### Hedef JSON (4-pane senaryo, kullanıcının örneği)

```jsonc
{
  "kind": "tab",
  "id": "tab_abc",
  "title": "MSP-BE-3 + MSP-MOB-7",
  "status": "active",
  "root": {
    "type": "split", "dir": "row", "sizes": [25,25,25,25],
    "children": [
      { "type":"leaf", "stableId":"u1", "status":"running",
        "role":"claude", "tickets":["MSP-BE-3"],
        "claude":true, "cwd":"/.../backend" },          // claude --session-id u1
      { "type":"leaf", "stableId":"u2", "status":"idle",
        "role":"app",  "tickets":["MSP-BE-3"], "cwd":"/.../backend" },
      { "type":"leaf", "stableId":"u3", "status":"running",
        "role":"claude", "tickets":["MSP-MOB-7"],
        "claude":true, "cwd":"/.../mobile" },            // claude --session-id u3
      { "type":"leaf", "stableId":"u4", "status":"idle",
        "role":"app",  "tickets":["MSP-MOB-7"], "cwd":"/.../mobile" }
    ]
  }
}
```

```jsonc
// Birinci-sınıf worktree node (git ile 1:1)
{
  "kind": "worktree",
  "id": "wt_91",
  "branch": "MSP-BE-3",
  "worktreePath": "/.../worktrees/MSP-BE-3",
  "status": "active",
  "children": [ /* bu worktree içinde açılan tab'lar/pane'ler */ ]
}
```

### Bu modelin dokunduğu mevcut kod (migration kapsamı)

| Alan | Mevcut | Hedef |
|---|---|---|
| Claude session | `claudeSessionId` yakalanır (capture mekanizması) | `claude --session-id <stableId>`; capture mekanizması silinir |
| Close | `closePane` splice + tree'den çıkar (`commands.ts:1008`) | `status='archived'` + PTY kill, node kalır |
| Worktree node | `FolderNode` + `worktreePath` marker | `kind:'worktree'` ayrı tip |
| Worktree prune | `reconcileWorktrees` gone→remove (`worktrees.ts:79`) | gone→`archived` (asla remove) |
| Ticket | `dailyTaskId: string` (tek) | `tickets: string[]` (çoklu) |
| Pane role | yok | `role` enum |
| Status | yok | her node'da `status` |
| SavedLeaf | `api.d.ts:2` | `status`, `role`, `tickets[]` eklenir; `dailyTaskId` migrate |

**Etkilenen todo'lar:** todo47/13 (persistence — bu modelle kökten çözülür),
todo7 (done→worktree sil — archived + git remove), todo6 (worktree aç —
`kind:'worktree'` + tickets bağı), todo14 (title/key — tickets[] gösterimi),
todo17 (worktree path — birinci-sınıf node'dan cwd), todo21/22 (iOS run terminal —
role:'build'/'app' + status). Bu bölüm bitmeden bu todo'lara başlanmaz.

### Background Processes (hidden shells) — iOS build/run'ın temeli

Build/run süreçleri tam bir görünür tab açmaz; ilgili worktree altında **isimli,
durumlu, gizli bir PTY** ("background process") olarak gösterilir — plan
dosyalarının pane altında gösterilmesinin birebir aynısı. Bir worktree'de aynı
anda çok hedef olabilir (iPhone sim + iPad sim + gerçek cihaz → 3 süreç).

**Saklama (karar 1):** Şimdilik **yalnızca worktree node**'unda, `processes[]`
listesi. İleride pane/tab'a da açılabilir şekilde tasarlanır.

```jsonc
{
  "kind": "worktree", "branch": "MSP-MOB-7", "worktreePath": "...",
  "status": "active",
  "processes": [
    { "stableId":"p1", "role":"build", "status":"running",
      "title":"Running on iPhone 16 simulator",
      "command":"ios-worktree.sh run ...", "cwd":"...",
      "target":{ "kind":"simulator", "name":"iPhone 16" } },
    { "stableId":"p2", "role":"build", "status":"done",
      "title":"Running on device — Akin's iPhone",
      "target":{ "kind":"device", "name":"Akin's iPhone" } }
  ],
  "children": [ /* görünür tab'lar */ ]
}
```

**Çekirdek altyapı — PTY/görünüm ayrımı + replay buffer (karar 3):**
Bugün terminal = PTY (main) + xterm (renderer) **1:1, ortak ömürlü**. Background
process bunu kırar:
1. **Ömür ayrımı:** PTY, onu gösteren xterm olmasa da yaşar. Görünüm "close"
   PTY'yi öldürmez (sadece detach).
2. **Replay buffer:** Main her background PTY'nin çıktısını dönen tamponda
   (+ ops. `<stateDir>/proc-logs/<stableId>.log`) tutar. Tıklayınca **attach**:
   yeni xterm → tampon replay → canlı akış. Kapatınca **detach**: PTY tampona
   yazmaya devam. Yeni eklenecek: (a) main'de süreç-başı çıktı tamponu,
   (b) renderer'da "var olan PTY'ye attach + replay" yolu.

**Davranış (karar 2 + 5):**
- Otomatik açılmaz (karar 4: hep hidden). Sol satıra tıkla → **ana alanda split
  pane** gibi açılır (PTY'ye attach + replay).
- Görünümü "close" → detach (öldürmez, arkada çalışır).
- Sol satırda sağ tık / üç-nokta → **"Kill" / "Close this process"** = gerçek kill.
- Biter → `status: done`; dismiss → `archived` (asla silinmez).
- Restart: PTY app kapanınca ölür → otomatik **respawn yok**; çalışıyordu ise
  `archived`/"interrupted" kaydı; kullanıcı yeniden tetikler.

**todo rafine:** todo21 ("run on device → yeni tab aç") bu yapıyla **değişir** —
artık hidden background process. todo20 hedef seçince doğru başlıkla process
spawn eder; todo22 son `target`'ı saklayıp play'de onu yeniden çalıştırır.

### Çözülen kararlar (kilitli) ✅
1. **Status enum:** `idle/running/waiting/done/archived`. Tab türetilir, worktree `active/archived`. (yukarı bkz.)
2. **Migration:** açılışta önce `crafterm-state.json` → `crafterm-state.backup-<ts>.json` kopyası, **sonra** tek seferlik migrate-on-load (eski şekil → yeni). Eski `dailyTaskId` → `tickets[]`, eski worktree folder → `kind:'worktree'`, eksik `status` → `idle`/`active`.
3. **Archived restore'da PTY açmaz** — sadece kayıt; sidebar'da "Show archived" altında.

---

## 2.6 — TEMEL İMPLEMENTASYON FAZLARI (önce bu)

> Kullanıcı kararı: diğer tüm todo'lardan önce bu temel kurulur. Sıralı, her faz
> sonrası `npx tsc --noEmit` (her iki config) + `npm run build` ile doğrulanır.
> Faz bittikçe durumu burada işaretlenir.

| Faz | İş | Dokunduğu yer | Durum |
|---|---|---|---|
| **F1** | Persistence şekli + backup + migrate-on-load. `SavedLeaf`'e `status/role/tickets[]`; `schemaVersion`; eski `dailyTaskId`→`tickets[]`; backup-before-migrate (son 5). | `preload/api.d.ts`, `types.ts`, `pane.ts`, `state.ts`, `main.ts`, `main/index.ts` | 🟩 Ready to test |
| **F2** | Status wiring. Pane busy→`running`, claude question→`waiting`; `syncPaneStatus`; tab türetme (`deriveTabStatus`); restart'ta running/waiting→idle. | `pane.ts`, `state.ts`, `main.ts`, `types.ts` | 🟩 Ready to test |
| **F3** | Never-delete → archive (inline, B). `closeTab`/`closePane`(last) → `archiveTab` (dormantRoot'a serialize + PTY kill, node tree'de kalır); restore'da dormant (PTY açmaz); sidebar archived gizler + "Show archived items" toggle + "Restore session"; `reactivateTab` mevcut buildLayout'tan yeniden kurar. | `types.ts`, `state.ts`, `commands.ts`, `main.ts`, `sidebar.ts` | 🟩 Ready to test |
| **F4** | `withClaudeSessionId` artık `pane.stableId`'yi `--session-id` olarak baka ediyor (önce `crypto.randomUUID()`'di) → session id == stableId. Resume zaten `--resume <claudeSessionId>` (=stableId). Capture polling elle-yazılan `claude` için fallback kalıyor; eski pane'ler kendi yakalanmış id'leriyle resume olmaya devam (migration gerekmez). | `commands.ts` | 🟩 Ready to test |
| **F5** | Worktree birinci-sınıf tip (`kind:'worktree'` + `WorktreeNode`/`SavedWorktree`, `processes[]` alanı). `isContainer`/adapter/`ancestorFolders`/serialize/buildSidebar worktree'yi tanır; eski folder+worktreePath migrate; `reconcileWorktrees` prune→archive (git 1:1); SCHEMA_VERSION=3. | `types.ts`, `api.d.ts`, `tree.ts`, `state.ts`, `commands.ts`, `main.ts`, `sidebar.ts`, `worktrees.ts` | 🟩 Ready to test |
| **F6** | Background process: main'de `proc:start/buffer/attach`+exit (stableId-keyed PTY + 256KB ring buffer); `bgproc.ts` (start/open-view/kill/exit); attach-pane (`createPane({attachId})`, `isProcessView`); sidebar worktree alt-satırları + "Run in background…"; close≠kill. | `main/index.ts`, `preload/*`, `pane.ts`, `commands.ts`, `sidebar.ts`+css, `bgproc.ts`, `main.ts` | 🟩 Ready to test |

**Sıra mantığı:** F1 her şeyin temeli (önce). F2/F3 F1'e dayanır. F4 görece bağımsız ama yüksek değer/risk. F5 worktree tipini kesinleştirir; F6 onun üstünde background process'i kurar. iOS todo'ları (todo20/21/22) F5+F6 bitince başlar.

**Durum:** F1✅ F2✅ F3✅(kullanıcı test etti) F5✅ F6✅ tamam. **F4 (claude `--session-id`) henüz yapılmadı** (worktree ile ilgisiz; ileride). iOS UI (todo20/21/22) F6 üstünde implement edildi.

### iOS UI (todo20/21/22) — implement edildi (+ UI bug fix turu)
- **todo21:** `runTarget` **background process** spawn ediyor (terminal değil); başlık "Running on … (simulator)" / "Running on device — …". Sub-row worktree altında.
- **todo20:** **Cascading menü** (`contextmenu.ts`'e nested/async submenu desteği eklendi): `Build & Run ▸ → On simulator/On device ▸ → <target> ▸ → <scheme>`. Eski ayrı-ayrı popup (promptSelect) yaklaşımı kaldırıldı. Veriler lazy: target'lar `ios:listTargets`, scheme'ler `ios:listSchemes` (cache'li). `IOSWT_SIMULATOR`/`IOSWT_DEVICE_UDID` + `IOSWT_SCHEME` scripte geçiyor.
- **todo22:** seçim (target + scheme) `worktree.lastRun`'a kaydediliyor; ▶ son seçimi çalıştırıyor, ilk run'a kadar disabled.
- **Bug fix turu:** (1) Process view'i tıklayınca **Free'de ayrı tab açmıyor** — aktif terminalin yanına **split** (yoksa worktree altında tab). (2) Process sub-row'ları **collapse'a saygılı** (worktree collapse → gizli, plan satırları gibi). (3) Cascade submenu async fetch sırasında **"Loading…"** flyout'u gösteriyor (kitlenme izlenimi yok).
- **Tüm aksiyonlar background:** Status + Clean de (terminal açan her şey) ortak `runScriptBg` ile **hidden background process** oldu — Build & Run ile aynı yapı. Stop = IPC (terminal değil). `runIn`/`runInFolder` kaldırıldı.

**⚠️ Cihaz enumerasyonu** (`xctrace` parse) ve **scheme listesi** (`xcodebuild -list`) gerçek cihaz/Xcode kurulumunda doğrulanmalı — burada test edilemedi.

---

## KÜME A — Daily Plan / Task UI

**İlişki:** Bu kümenin tamamı `settings.dailyPlan` (tasks/tags) ve
`pane.dailyTaskId` çevresinde döner. Persistence (todo47/13) sağlam olmadan
done-on-close (todo7) ve worktree-aç (todo6) güvenli değil. todo5'in ürettiği
treeview-dropdown component'i todo4'ün (proje filtresi) ve todo6'nın
project-seçim UI'ını besler. todo14 ticket key'in title'ı ezmesini düzeltir —
bu da todo47/13 ile aynı "terminal ↔ ticket" görüntüleme katmanına dokunur.

### todo9 — New-task modal title kutusunu büyüt `❓`
- **Ne:** Daily plan new-task modalındaki title input'u description gibi büyük (multi-line/yüksek) yap.
- **Teknik:** `dailyPlan.ts` modal render; salt CSS/markup.
- **Açık sorular:**
  1. Title tek satır mı kalsın yoksa description gibi çok satırlı `textarea` mı olsun? (Tek satır ama daha uzun/yüksek mi, yoksa gerçekten multi-line mı?)

### todo8 — `Cmd+N` new-task açmıyor (bug) `❓`
- **Ne:** Daily plan ekranı açıkken `Cmd+N` yeni task modalını açmalı; açmıyor.
- **Teknik:** Global keybinding (`keybindings.ts` / `main.ts`) daily plan context'inde new-task'a bağlanmamış veya başka handler yutuyor.
- **Açık sorular:**
  1. `Cmd+N` sadece daily plan ekranı aktifken mi çalışsın, yoksa her yerden daily plan + new-task mı açsın?
  2. `Cmd+N` şu an global olarak başka bir şeye (yeni terminal/tab?) bağlı mı — çakışma var mı?

### todo12 — "Run in claude session" + `ultrathink ` prefix `❓`
- **Ne:** Kartlardaki/new-task'taki "run terminal" butonlarının adını "Run in claude session" yap; title gönderilirken başına default `ultrathink ` ekle.
- **Teknik:** `dailyPlan.ts` / `commands.ts` (openInTerminal akışı, title geçişi).
- **Açık sorular:**
  1. `ultrathink ` prefix'i **her zaman** mı eklensin, yoksa kapatılabilir bir setting/toggle mı olsun?
  2. Buton adı **tüm** "run terminal" yerlerde mi değişsin (kart + new-task + pane menüsü), yoksa sadece daily plan içinde mi?
  3. Mevcut "new tab" / "split" seçenekleri korunsun mu, yoksa hepsi tek "Run in claude session"a mı dönsün?

### todo14 — Title yanında `(KEY)`, rename çalışsın `❓`
- **Ne:** Şu an key id terminal title'ını eziyor ve manuel rename tutmuyor. İstenen: key, title'ın yanında parantez içinde `Title (MSP-BE-3)`; kullanıcı title'ı rename edebilsin, key sabit kalsın.
- **Teknik:** `pane.ts:388-397` (chip/title render), rename akışı; `titleLocked` mantığı.
- **Açık sorular:**
  1. `(KEY)` hem **pane header**'da hem **sol panel (sidebar)**'da mı görünsün?
  2. Key tıklanabilir olsun mu (ör. ticket'a/worktree'ye gitsin)?
  3. Kullanıcı rename edince, key olmayan normal terminallerdeki davranış değişmemeli — doğru mu?

### todo47 ≡ todo13 — Restart sonrası ticket↔terminal bağı (bug) `❓`
- **Ne:** Daily ticket ile terminal açıp app'i kapatıp açınca terminal ticket'ı algılamıyor, boş normal terminal gibi davranıyor.
- **Teknik bulgu:** `dailyTaskId` zaten persist ediliyor (`state.ts:323`, restore `main.ts:438`, `api.d.ts:18`). Kopukluk büyük ihtimalle: restore'da pane yeni `id` alıyor ama chip/sidebar yeniden bağlanmıyor; veya `syncPaneDailyChip` restore sonrası çağrılmıyor; veya leaf→pane eşleştirmesi `dailyTaskId`'yi taşımıyor.
- **Açık sorular:**
  1. Bu iki todo (todo47 + todo13) aynı bug — **tek madde** olarak kapatıyorum, onaylıyor musun?
  2. Bağ kaybolan terminal: header chip mi kayıp, sol paneldeki key mi kayıp, yoksa ikisi de mi? (Doğru kök nedeni daraltmak için.)
  3. Claude session'lı (resume edilen) panellerde mi yoksa normal panellerde mi oluyor, yoksa fark etmiyor mu?

### todo7 — Task done → ilişkili workspace'i sil? `❓`
- **Ne:** Daily task "done"a çekilince ilişkili workspace (worktree) varsa "sileyim mi?" sor; evet ise sil.
- **Teknik:** done-transition hook (`dailyPlan.ts`), worktree silme (mevcut worktree komutları, `commands.ts`/main `git:*`). todo47/13 sağlam olmalı (hangi worktree'nin task'a ait olduğunu bilmek için).
- **Açık sorular:**
  1. "İlişkili workspace" nasıl tespit edilecek — task ile worktree arasındaki bağ nerede tutuluyor? (Şu an böyle bir alan yok; todo6 ile birlikte mi eklenecek?)
  2. Silme onayı: sadece worktree klasörü mü, yoksa branch da (`git branch -D`) silinsin mi?
  3. Worktree'de commit edilmemiş değişiklik varsa: uyar + iptal mı, yoksa zorla mı sil?
  4. "done" terminal tarafında mı (pane done) yoksa daily plan board'da mı tetiklenecek (ikisi de mi)?

### todo5 — Project dropdown → treeview/menu component `❓`
- **Ne:** New-task modalındaki project dropdown'u, proje + sub-proje'leri listeleyen treeview-dropdown (veya hover-menu) component'ine çevir. Yeniden kullanılabilir component olsun.
- **Teknik:** Yeni component (`pickers.ts` veya yeni dosya); sidebar tree veri kaynağı (`SidebarNode`).
- **Açık sorular:**
  1. Davranış: tıklayınca açılan tree mi, yoksa üstüne gelince açılan cascading hover-menu mi (ikisini de yazdın — hangisi öncelik)?
  2. Sadece project + sub-project mi, yoksa worktree/feature node'ları da mı seçilebilsin?
  3. Component nerede yeniden kullanılacak — todo4 (filtre) + todo6 dışında başka yer var mı? (API'yi ona göre tasarlarım.)
  4. Çoklu seçim gerekli mi, yoksa tek seçim mi?

### todo4 — Daily plan'a proje filtresi `❓`
- **Ne:** Daily plan'ı proje bazlı ayır; proje filtresi koy, seçilen projenin tüm task'larını listele.
- **Teknik:** `dailyPlan.ts` board render + filtre state; todo5 component'ini filtre UI'ı olarak kullanır.
- **Açık sorular:**
  1. Filtre tek proje mi seçsin, yoksa çoklu mu?
  2. Seçili filtre persist edilsin mi (app yeniden açılınca hatırlasın)?
  3. Task'lar zaten bir projeye mi bağlı (mevcut `DailyPlanTask`'ta project alanı var mı), yoksa bunu da mı eklememiz gerek?
  4. "Tümü" / filtresiz görünüm default mu kalsın?

### todo6 — "Terminalde aç"a create-worktree seçeneği `❓`
- **Ne:** Yeni ticket için "terminalde aç" akışına "create worktree" seçeneği ekle; seçilirse branch ve worktree adı ticket key'i olacak şekilde (key=`MSP-BE-3` → branch ve worktree de `MSP-BE-3`) worktree açıp attach et.
- **Teknik:** `commands.ts` openInTerminal + mevcut worktree oluşturma akışı (`run-create-worktree` skill / git `worktree add`).
- **Açık sorular:**
  1. Worktree hangi base'den oluşacak (`main` mi, mevcut branch mi, kullanıcı mı seçsin)?
  2. Branch zaten varsa: ona attach mı, yoksa hata mı?
  3. Worktree fiziksel olarak nereye oluşacak — projenin worktrees klasörü mü (mevcut `worktreeContainer` yapısı)?
  4. Ticket key'inde branch adında geçersiz karakter olursa (boşluk vb.) nasıl sanitize edelim?
  5. Bu worktree ↔ task bağı todo7'nin (done'da sil) ihtiyaç duyduğu bağ — burada mı kuralım (task'a worktree path'i yazalım)?

### todo49 — Ticket'lar için web arayüzü (paylaşımlı) `❓`
- **Ne:** Daily plan ticket'ları için web arayüzü; Ayşe Deniz'in de görmesi için.
- **Teknik:** Tamamen yeni yüzey; **todo61 (sync/storage) gerektirir** — veriyi paylaşmak için ortak bir backend/store şart.
- **Açık sorular:**
  1. Bu madde todo61 (sync altyapısı) yapılmadan başlayamaz — sıralamayı kabul ediyor musun (önce todo61)?
  2. Sadece görüntüleme mi, yoksa Ayşe Deniz de düzenleyebilecek/yorum yapabilecek mi?
  3. Hosting/erişim: public link mi, login'li mi?
  4. Brainstorm maddesi — şimdilik sadece soruları netleştirip beklemeye mi alalım?

---

## KÜME B — Search / Agent / Claude Entegrasyonu

**İlişki:** todo25 "açık Claude session'a mesaj gönder" primitive'ini kurar;
bu primitive todo3'teki (otomatik session başlatıp metin passleme) akışın
temelidir. todo2 (spotlight) birleşik arama altyapısı; todo3'ün "claude
sessions" + "terminal sessions" sekmeleri onun üstünde yaşar. Yani sıra:
todo25 (primitive) → todo2 (arama altyapısı) → todo3 (büyük agent ekranı).

### todo25 — Markdown chat → açık Claude session'a mesaj `❓`
- **Ne:** Markdown dökümanındaki chat butonuna basınca yazılan mesajı, açık bir Claude session'a (session id ile) yeni mesaj olarak gönder.
- **Teknik araştırma:** Claude'un çalışan bir session'a dışarıdan mesaj enjekte etme desteği var mı? (CLI `--resume` yeni process açar; çalışan PTY'ye yazmak farklı.) Muhtemel yol: ilgili pane'in PTY'sine metni yazmak (`pty:write`).
- **Açık sorular:**
  1. "Açık session" = ekranda zaten çalışan bir Claude pane'i mi (PTY'ye yaz), yoksa kapalı bir session id'yi yeniden mi başlatalım?
  2. Birden fazla açık Claude pane varsa hedef nasıl seçilecek (picker mı, "son aktif" mi)?
  3. Mesaj gönderilince otomatik Enter'lansın (hemen çalışsın) mı, yoksa sadece yazılıp kullanıcı mı göndersin?

### todo2 — Spotlight (Cmd+P) tab'lı birleşik arama `❓`
- **Ne:** Cmd+P ile açılan, tab'lı tek bir spotlight: file / command / claude sessions / terminal sessions / shortcut list / plans / tasks / bookmarks / applications. Her tab'ın kendi shortcut'ı, arama barından tab'lar arası geçiş.
- **Teknik:** Mevcut `pickers.ts` finder'larını tek bir tab'lı kabuk altında birleştirmek.
- **Açık sorular:**
  1. Mevcut ayrı picker'lar (project/worktree/SSH/command palette) **kaldırılıp** bu spotlight'a mı taşınacak, yoksa spotlight onların üstünde ek bir katman mı?
  2. Tab listesi kesin mi: file, command, claude sessions, terminal sessions, shortcuts, plans, tasks, bookmarks, applications — eksik/fazla var mı?
  3. "bookmarks" şu an var mı (yeni bir kavram mı ekliyoruz)?
  4. Tab geçişi nasıl: `Tab`/`Cmd+1..9` ile mi, prefix sözdizimi (`>command`, `@file`) ile mi, ikisi de mi?
  5. Büyük scope — todo3'ten **bağımsız** mı ilerlesin, yoksa todo3 ile birlikte mi tasarlansın?

### todo3 — Cursor-style new-agent ekranı + plan-mode `❓`
- **Ne:** Cursor'daki gibi new-agent ekranı: project/repo/branch/worktree seçip conversation otomatik başlat. Default Claude session açar, girilen metni session'a otomatik passler (session id ile başlatır). Ayrıca plan-mode akışı (Cursor benzeri).
- **Teknik:** todo25 primitive + todo2 arama + worktree akışı (todo6) birleşimi. **En büyük UI scope.**
- **Açık sorular:**
  1. Plan-mode'u sen ayrı bir ticket'tan yönetelim dedin — onu bu dosyada **ayrı bir madde** olarak mı açayım, yoksa şimdilik bu maddenin altında alt-scope mu kalsın?
  2. "Otomatik session başlat + metni passle": yeni `claude` process'i title/prompt ile mi başlatılacak, yoksa todo25'teki PTY-write yolu mu?
  3. Bu ekran nereden açılacak (yeni global shortcut, sidebar butonu, spotlight tab)?
  4. Bu madde todo25 + todo2 + todo6 tamamlanmadan başlamasın — sıralamayı onaylıyor musun?

---

## KÜME C — iOS Worktree

**İlişki:** Zincirleme bağımlı. todo17 (worktree path algılama) aslında
**genel** bir bug ve iOS aksiyonlarının doğru klasörde çalışması için önkoşul.
todo21 run-on-device'ı özel bir "tagged terminal" haline getirir; todo20 o
terminalin nasıl/nerede (device/simulator + schema) çalışacağını seçtiren menüyü
ekler; todo22 play butonunu "son seçimi tekrarla"ya çevirir (todo20'nin seçim
modelini state.tree'de saklamaya dayanır); todo23 tüm bunları bir skill'le
otomatikleştirir. todo24 (package paylaşımı) bağımsız performans araştırması.

### todo16 — iOS worktree → `Secrets.xcconfig` kopyala `❓`
- **Ne:** Worktree oluşunca `Secrets.xcconfig.template`'i kopyalayıp ana repoya `Secrets.xcconfig` olarak koy (run-on-device akışı için), `resources/scripts/ios-worktree.sh` içinde.
- **Teknik:** `ios-worktree.sh`'a kopyalama adımı.
- **Açık sorular:**
  1. Kaynak template ana repodaki mi worktree içindeki mi `Secrets.xcconfig.template`?
  2. Hedef "ana repoya koy" mu dedin yoksa **worktree'ye** mi (worktree'de build edileceği için worktree olması mantıklı — netleştir)?
  3. Hedefte dosya zaten varsa: üzerine yaz mı, dokunma mı?

### todo17 — Worktree path algılama (files yanlış klasör) `❓`
- **Ne:** Worktree modunda çalışırken files kısmı main worktree'nin path'ini listeliyor; worktree klasörünün içindekileri listelemeli.
- **Teknik:** `pane.cwd`/`worktreePath` (types.ts:185) ile files explorer cwd çözümü. Worktree'nin nasıl tutulduğunu (`SidebarNode.worktreePath`) baz alıp explorer'ı ona yönlendir.
- **Açık sorular:**
  1. Files paneli cwd'yi **aktif pane'in cwd'sinden** mi alıyor, yoksa seçili sidebar node'undan mı (kök neden hangisinde)?
  2. Beklenen: aktif terminal worktree içindeyse files o worktree'yi göstersin — doğru mu?
  3. Bu sadece files panelini mi etkiliyor, yoksa plans/time gibi cwd'ye dayanan başka yüzeyler de yanlış mı?

### todo21 — Run-on-device özel terminal + state.tree tag `❓`
- **Ne:** Run-on-device tıklanınca yeni terminal açılsın, başlığı "Running on device" gibi olsun, state.tree'de o worktree'ye ait işaretlensin. Default olarak hemen açılmasın — kullanıcı isterse açsın.
- **Teknik:** Yeni pane türü/tag (`SidebarNode` veya `Pane` üzerinde "build terminal" işareti); `ios-worktree.sh` tetikleme.
- **Açık sorular:**
  1. "Default olarak hemen açılmasın" — yani buton tıklanınca terminal **arka planda** mı oluşsun (sidebar'da node olarak), kullanıcı tıklayınca mı görünsün? Akışı netleştir.
  2. Bu özel terminal worktree node'unun **alt node'u (sub-node)** olarak mı görünsün?
  3. Tek worktree için tek build-terminal mi (varsa tekrar kullan), yoksa her run yeni terminal mi?

### todo20 — Device/simulator + local/default schema menüsü `❓`
- **Ne:** Run ederken local mi default schema mı, hangi device/simulator — iç içe menü:
  `Build & Run > on device >> <device> >>> local schema / default schema`,
  `> on simulator >> <simulator> >>> ...`. Available device & simulator'lar dinamik çekilecek.
- **Teknik:** XcodeBuildMCP veya `xcrun`/`xcodebuild` ile device/simulator listesi; çok seviyeli action menüsü.
- **Açık sorular:**
  1. Device/simulator listesini neyle çekelim — XcodeBuildMCP mı, doğrudan `xcrun simctl` / `xcrun devicectl` mi?
  2. "schema" = Xcode **scheme** mi, yoksa farklı bir kavram mı (local vs default ne demek — config/scheme isimleri ne)?
  3. Schema isimleri sabit mi (`local`, `default`), yoksa projeden mi okunacak?
  4. Action butonu çok-seviyeli cascade menü mü olacak, yoksa adım adım picker mı?

### todo22 — Play butonu son seçimi hatırlasın `❓`
- **Ne:** Sol paneldeki play butonu: ilk kez ve hiç run edilmemişse disabled; bir kez run edilmişse o seçimi sakla (state.tree'de worktree node altında), play'e basınca hep son seçimi aynı device + aynı terminalde çalıştır.
- **Teknik:** todo20'nin seçim modelini (`device + schema`) `SidebarNode`/state.tree'ye persist; todo21'in özel terminalini yeniden kullan.
- **Açık sorular:**
  1. "Son seçim" worktree başına mı saklanır (her worktree'nin kendi son device'ı)?
  2. Persist edilen alan ne içerir: target type (device/sim), device id, schema?
  3. todo20 + todo21 tamamlanmadan başlanamaz — sıralamayı onaylıyor musun?

### todo23 — `/run-on-device <worktree>` skill `❓`
- **Ne:** Claude'un otomatik algılayıp kullanması için `run-worktree-build-and-run-ios-on-device` skill'i; worktree içinde çalışınca o worktree'ye ait kurulumu otomatik run etsin. (Var olanı parametreli mi yapalım: `/run-on-device <worktreename>`?)
- **Teknik:** Yeni skill (`.claude/skills` veya proje skill'i) + ios-worktree.sh sarmalama.
- **Açık sorular:**
  1. Yeni skill mi yazalım, yoksa mevcut bir skill'i parametreli mi yapalım (hangisi)?
  2. Skill device/simulator seçimini todo22'deki "son seçim"den mi alsın, yoksa parametre mi?
  3. todo20–22 hazır olmadan skill yazmak erken — önce onlar mı?

### todo24 — Worktree'ler arası Swift package paylaşımı `❓`
- **Ne:** Run-on-device'da SPM paketleri (`swift-protobuf` vb.) her worktree için yeniden indiriliyor; 5-6 worktree senaryosunda çok yavaş. Çözüm araştırması: ortak cache / main'den copy-paste / node_modules mantığı.
- **Teknik:** Araştırma — `CLONED_SOURCE_PACKAGES_DIR` / DerivedData paylaşımı, `-clonedSourcePackagesDirPath`, SPM cache.
- **Açık sorular:**
  1. Bu salt research/brainstorm mı (öneri çıkarıp dur), yoksa seçilen çözümü implement mı edelim?
  2. Paylaşımlı cache kabul edilebilir mi (worktree'ler aynı paket sürümünü paylaşır — izolasyon kaybı sorun mu)?

---

## KÜME D — Cloud Sync & Mobil (brainstorm, en büyük scope)

**İlişki:** todo61 (account-bazlı storage/sync) temel; hem todo68 (mobil) hem
todo49 (web UI) ona dayanır. Önce sync altyapısı tasarlanmadan diğer ikisi
başlayamaz.

### todo61 — Account-bazlı online/GitHub storage sync `❓`
- **Ne:** Crafterm verilerini (state, daily plan, notebooks...) online db veya GitHub-based storage'da tutup account bazlı her yerden erişim. Brainstorm.
- **Açık sorular:**
  1. Yön: kendi backend'imiz (Supabase/Firebase/custom) mi, yoksa GitHub repo (private) tabanlı git-sync mi?
  2. Neler sync edilecek — sadece daily plan/tasks mı, tüm `crafterm-state.json` mu, notebooks da mı?
  3. Account/auth: GitHub OAuth mu, e-posta/şifre mi?
  4. Conflict resolution gerekli mi (aynı veriyi iki makineden değiştirme)?
  5. Şimdilik sadece brainstorm dokümanı mı çıkaralım (implement etmeden)?

### todo68 — Mobil uygulama `❓`
- **Ne:** Mobil uygulama (veya Electron mobile-convert) ile mobilden idea üretip terminalleri görüp yönetmek; makine açıkken tam yetkiyle uzaktan kontrol. Brainstorm.
- **Açık sorular:**
  1. Native (React Native/Swift) mı, yoksa Electron-tabanlı/web responsive mi?
  2. "Terminalleri yönet" — canlı PTY stream'i mobile mı (gerçek zamanlı uzak terminal), yoksa sadece komut tetikleme + sonuç mu?
  3. Bağlantı modeli: doğrudan makineye (LAN/tunnel) mı, todo61'deki cloud üzerinden mi?
  4. todo61 olmadan başlanamaz — sıralamayı onaylıyor musun?
  5. Şimdilik sadece brainstorm mı?

---

## KÜME E — IDE Files (bağımsız)

### todo1 — VSCode-style IDE editör → files paneli `❓`
- **Ne:** VSCode IDE yapısını files kısmına implemente edebilir miyiz — araştırma.
- **Teknik:** `explorer.ts` + yeni editör; Monaco/CodeMirror (SQL pane'de CodeMirror zaten var).
- **Açık sorular:**
  1. Hedef: salt syntax-highlight'lı **görüntüleme** mi, yoksa tam **düzenleme + kaydetme** (gerçek IDE) mi?
  2. Editör motoru: Monaco mı (VSCode'un motoru, yeni dep) yoksa mevcut CodeMirror'ı mı genişletelim?
  3. Hangi özellikler kritik: tabs, tree, search-in-files, git gutter, IntelliSense — minimum scope ne?
  4. Bu büyük; önce bir spike/research dokümanı mı çıkaralım?

---

## 3. Açık Soruların Yönetimi

Yukarıdaki her `❓` blok için sorular yanıtlandıkça:
1. Yanıtı ilgili maddenin altına **"Karar:"** satırı olarak işlerim.
2. Maddenin durumunu `❓ → 🟦 In progress` yaparım (master tablo + başlık).
3. Bitince `🟩 Ready to test`; backlog JSON'da da statüsünü güncellerim.

**Öneri başlangıç sırası:** Önce 🟢 grup (todo9, todo8, todo12, todo16) — düşük
riskli, bağımsız. Paralelde todo47/13 (persistence bug) — A kümesinin temeli.
Soruları gruplar halinde netleştirip ilerleriz.
