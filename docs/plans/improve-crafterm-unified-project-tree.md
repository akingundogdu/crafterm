# Plan: Unified Project Tree (settings.projects → state.tree)

Branch: `improve-crafterm`
Slug: `unified-project-tree`

## Goal

Şu an "proje" iki ayrı yerde tutuluyor:

- **`state.tree`** — Sol paneldeki canlı `SidebarNode[]` ağacı (Tab + Folder + Project karışık).
- **`settings.projects`** — Settings → Projects panelinin düzenlediği `Project[]`
  katalog ağacı; sub-project ağacı bu tarafta `Project.children?` ile yaşıyor.

İkisi otomatik olarak senkron değil (sadece `group` alanı tek yönlü senkronize
ediliyor — `syncProjectGroupToTree`). Sonuç:

- Settings'te path/command/startup/env/shell değiştirilince sidebar'a yansımıyor.
- Sub-project Settings'te ekleniyor ama sidebar'a düşmüyor.
- Apps + Features de path bazlı ayrı bir `settings.features[]` + `Project.apps[]`
  hattında yaşıyor; tek bir noktada toparlanmıyor.

**Hedef:** `settings.projects` katalogunu kaldır; tek kaynak `state.tree`.
`ProjectNode` artık eskiden `Project`'in taşıdığı her şeyi (apps, features,
sub-project ağacı) doğrudan kendisi taşır. Picker, settings paneli, sidebar
hepsi bu tek ağaçtan beslenir.

## Current state (kod referansları)

- `types.ts:118-133` — `ProjectNode` (kind=`project`): name, path, command, group,
  startup, env, shell, children: `SidebarNode[]`. **Apps yok.**
- `types.ts:157-167` — `Project` (catalog şablon): name, path, command, group,
  startup, env, shell, **apps?: Application[], children?: Project[]**.
- `types.ts:192-196` — `Feature`: `projectPath` ile bir projeye iliştirilmiş.
- `types.ts:199-206` — `TimeEntry`: `projectPath` + `featureId`.
- `state.ts:62, 77, 78` — `settings.projects`, `settings.features`, `settings.timeEntries`.
- `state.ts:282-315` — `persist()`: tree + projects + features + timeEntries hepsi
  aynı `SavedState`'e gidiyor; tek dosyaya yazılıyor.
- `state.ts:344, 358, 359` — `loadSettings`: ayrı ayrı okuyor.
- `commands.ts:193-229` — `openProject(p, parent?)`: picker'dan gelen `Project`'i
  alır, `state.tree`'de path bazlı eşleşeni bulur (yoksa `ProjectNode` yaratır),
  yeni terminal açar.
- `commands.ts:481-492` — `setNodeGroup`: tek senkron noktası (`syncProjectGroupToTree`).
- `commands.ts:496-530` — `createProject(parentId?)`: hem `state.tree`'ye
  `ProjectNode` ekler hem path duplikatı yoksa `settings.projects`'a şablon basar.
- `commands.ts:260-345, :368-475` — `showRunApps`, `showRunAppsForFeature`:
  `Project.apps` + `settings.features` + `settings.timeEntries` üzerinde çalışır.
  Sağ tık → "Run applications…" / "New feature…" buradan gider
  (`sidebar.ts:535-536`).
- `settings.ts:384-714` — Projects paneli: `settings.projects` üzerinde tüm
  CRUD'u yapar (name, path, group, command, startup, shell, env, apps,
  sub-projects, delete).
- `catalog.ts` — `flattenProjects`, `findProjectByPath`, `removeProject`
  (`Project[]` üzerinde çalışır).
- Picker'lar — `pickers.ts`: cmd+T proje picker'ı `settings.projects`'tan beslenir.
- `time.ts` / `reminders.ts` / time-tracking — `settings.features` +
  `settings.timeEntries` üzerinden, `projectPath` ile eşleşir.

## Target model (yeni şekil)

**Tek tree.** `state.tree: SidebarNode[]`. `ProjectNode` şu hale gelir:

```ts
interface ProjectNode {
  kind: 'project'
  id: string
  name: string
  color: NodeColor
  collapsed: boolean
  pinned: boolean
  children: SidebarNode[]   // alt-folder, alt-tab, alt-project
  path: string
  command?: string
  group?: string
  startup?: string
  env?: string
  shell?: string
  apps?: Application[]       // YENİ: eskiden Project.apps
  features?: Feature[]       // YENİ: eskiden settings.features (projectPath ile)
}
```

`Application` ve `Feature` aynen kalır (zaten serileştirilebilir tipler).

**`settings.projects` silinir.** `settings.features` silinir (artık
`ProjectNode.features[]` içinde). `settings.timeEntries` **kalır** ama
`featureId` ve `projectId` (yeni: stable node id) ile bağlanır — `projectPath`
bağı zayıf, kullanıcı path değiştirince geçmiş bozulmasın diye. Migration'da
mevcut `timeEntries.projectPath` → o path'e karşılık gelen `ProjectNode.id`
çıkarılır.

Sub-project = `ProjectNode.children` altındaki bir `ProjectNode`. Sub-folder = bir
`FolderNode`. Picker tüm ağacı `kind === 'project'` filtresiyle düzler.

## Migration (eski state.json okuma)

`loadSettings`'te bir kerelik dönüşüm:

1. `saved.projects` (varsa) içindeki her catalog projesini path bazlı sidebar
   `ProjectNode` ile eşle.
   - Eşleşen `ProjectNode` varsa: catalog projesinden eksik alanları (apps,
     startup, env, shell, command, group) sidebar node'a kopyala. Catalog'un
     `children` (sub-proje) ağacını sidebar `ProjectNode.children`'a
     **MERGE et** (path bazlı dedup ile). Sub-project'ler sidebar'da yoksa
     yeni `ProjectNode` oluşturup ekle.
   - Eşleşen yoksa: sidebar `state.tree`'nin köküne yeni bir `ProjectNode`
     yarat, alanları + sub-project ağacını taşı.
2. `saved.features` (varsa): her feature için `projectPath` ile eşleşen
   `ProjectNode` bul; `node.features = (node.features ?? []).concat(feature)`.
3. `saved.timeEntries`: olduğu gibi yüklenir; `projectPath` koruna kalır
   (geriye-dönük rapor için path-based eşleme yeterli; ileride id'ye geçeriz
   ama bu plan kapsamı dışında).
4. Migration sonrası `persist()` tetikle (debounced). Yeni dosyada `projects[]`
   ve `features[]` artık yok.

## Implementation steps

### 1. Tipler

- `types.ts`: `ProjectNode`'a `apps?: Application[]` ve `features?: Feature[]`
  ekle. `Project` tipini sil **(veya `@deprecated` yorum + kullanım yerlerini
  ProjectNode'a taşıdıktan sonra sil — tek seferde temizleyelim)**.
- `preload/api.d.ts` — `SavedProjectNode` (veya `SavedSidebarNode`'un proje
  varyantı) `apps?`, `features?` taşıyacak. `SavedState`'ten `projects?` ve
  `features?` alanlarını silmiyoruz (migration için **bir tur daha okuyacağız**;
  bir sonraki release'te silinir). Yorumla işaretle.

### 2. State + persist

- `state.ts`:
  - `settings.projects` ve `settings.features` alanlarını sil.
  - `serializeNode` → proje dalında `apps` ve `features` alanlarını serileştir.
  - `loadSettings` → migration kodunu yaz (yukarıdaki Migration adımları).
  - `persist()` → `projects` ve `features` alanlarını artık yazma.

### 3. Catalog helper'ları

- `catalog.ts` — fonksiyonları `Project[]`'ten `SidebarNode[]`'a çevir:
  - `flattenProjects(tree)` → tüm `kind === 'project'` node'ları sıralı liste
    olarak verir. **Çağıranlar** (picker, settings paneli, openProject)
    yeni signature'a uyacak.
  - `findProjectByPath(tree, path)` → `state.tree`'de path eşleşen ilk
    `ProjectNode`. Çağıranlar (`commands.ts:209, 276, 382, 487`) güncellenir.
  - `removeProject(tree, node)` → `state.tree`'den verilen node'u çıkar
    (parent listesini bulup splice). Settings panelinin "Delete project"
    butonu bunu kullanır.

### 4. commands.ts

- `openProject` — input tipini `ProjectNode | { name, path, … }` esnetebilir
  ama temiz olan: artık doğrudan picker'dan seçilen `ProjectNode`'u alır
  (zaten ağaçta var, sadece yeni bir terminal açar). Path bazlı oluşturma
  yolunu kaldır — picker yalnızca **var olan** node'ları gösteriyor.
  - Geriye dönük: eğer path verilip node yoksa (örn. eski Cmd+P "yeni
    path") gene de oluştur. Picker dialog'una "Yeni proje ekle" alanı
    eklenmedi — `createProject` zaten o iş için var.
- `createProject` — yalnızca `state.tree`'ye ekler; `settings.projects`'a
  yazma satırını kaldır.
- `setNodeGroup` — `syncProjectGroupToTree` çağrısını sil; sadece `node.group`
  yazar (catalog yok).
- `showRunApps` / `showRunAppsForFeature` — `Project` parametresi yerine
  `ProjectNode` alır. `Project.apps` yerine `node.apps`. Path bazlı
  "var mı yarat" kodu artık gereksiz — node zaten ağaçta.

### 5. settings.ts → Projects paneli

- `buildProjectsPanel`:
  - Sol liste: `flattenProjects(state.tree)` üzerinden render.
  - Detay alanı: seçilen `ProjectNode`'u doğrudan mutate eder. `name`,
    `path`, `group`, `command`, `startup`, `shell`, `env`, `apps`,
    `features` (yeni!) buradan düzenlenir.
  - `+ Add project` → `createProject(null)`'u çağırır (yeni node `state.tree`
    köküne düşer); seçili olur.
  - `+ Add sub-project` → ebeveynin `children`'ına yeni `ProjectNode` ekler.
  - `Delete project` → `removeProject(state.tree, node)`.
  - Her field değişikliğinden sonra `requestSidebar()` da çağrılır (sol
    panel anında yansısın).

### 6. Sidebar — Folder settings modali

- `sidebar.ts:684-752` (`showFolderSettings`): node bir `ProjectNode` ise
  modal başlığını "Project settings — …" yap; **`name`, `path`, `command`**
  alanlarını da ekle (folder için yalnızca `name` + startup/env/shell kalır).
- Save sonrası `requestSidebar()` çağrısı zaten var.

### 7. Pickers / time tracking / her yer

- `pickers.ts` — proje picker'ı `flattenProjects(state.tree)` ile beslenir.
- `time.ts`, `pane.ts`'in time-tracking ile alakalı yerleri — `settings.features`
  yerine ağaçta `ProjectNode.features[]` üzerinden ara. Yardımcı:
  `findFeatureById(state.tree, featureId)` → `{ project, feature }`.
- `commands.ts:syncProjectGroupToTree` artık gereksiz, sil.

### 8. Temizlik

- `Project` ve `Feature.projectPath` (Feature artık node'a iliştirildiği için
  projectPath'i kaldırabiliriz; ama timeEntries.projectPath'i koruyalım çünkü
  eski entrylerle uyumlu — daha sonra ayrı plan).
- `loadSettings`'te eski `saved.projects` / `saved.features` okuma satırlarını
  yalnızca migration için tut (bir sonraki release'te tamamen kaldırılacak —
  TODO yorumu).

## Verification

CLAUDE.md tarif ettiği gibi test framework yok. Adımlar:

1. `npx tsc --noEmit -p tsconfig.web.json` ve `-p tsconfig.node.json` — temiz
   olmalı.
2. `npm run build` — başarılı olmalı.
3. `npm run dev` ile manuel akış:
   - Boş bir `~/.crafterm-dev/crafterm-state.json` ile başla → tree boş.
   - **Migration testi:** elle eski şekilde bir state hazırla (mevcut
     development state yedeklenir, bir kopya `settings.projects` +
     `settings.features` ile yüklenir). Açılışta sidebar'a düşmeli; ikinci
     açılışta dosyada `projects`/`features` alanları silinmiş olmalı.
   - Sol panelden `New project…` → tree'de görünür, Settings → Projects
     panelinde de görünür. İkisi aynı veri.
   - Settings → Projects: bir field değiştir (örn. path, command, startup).
     Sol panelde anında yansımalı (`requestSidebar`).
   - Sol panel: bir projeye sağ tık → "Folder settings…" (artık Project
     settings) → name/path/command değiştir → Settings panelinde de
     güncellenmiş.
   - Sağ tık → "New terminal here" → terminal projenin path'inde açılır
     (1. iş zaten merge edildi; regresyon olmadığını teyit et).
   - Sub-project: bir projeye sağ tık → "New project (here)" (yeni;
     `createProject(node.id)`). Sidebar + Settings'te ikisinde de hiyerarşi
     görünmeli.
   - Apps + Features: bir projenin Application'ı ile "Run applications…"
     yine çalışmalı. Feature oluştur → time-tracking devam etmeli.

## Scope guard

- Time-tracking entry'lerinin `projectPath` → `projectId` migration'ı **bu
  plan dışı**. Geriye dönük ekledikçe path eşleşmesi yeterli.
- `Feature.projectPath` alanını şimdilik **tutuyoruz** (timeEntries
  kullanıyor); ileride ayrı bir plan.
- Sub-project hiyerarşisi ProjectNode altında ProjectNode olarak yaşar; UI'da
  ayrıca özel render yok — mevcut ağaç renderer'ı zaten container davranışını
  destekliyor.
