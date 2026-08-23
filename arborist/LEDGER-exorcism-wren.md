# Arborist exorcism — findings ledger — **Wren**

*Phase 1, read-only. Started 2026-08-23. Signed `— Wren` throughout.*
*⛔ This file is a phase-1 work product. It retires (to `arborist/_archive/`) when its
findings land in `ORIENTATION.md` / the code, per `CLAUDE.md`'s prune rule.*

---

## §0 — THE FIRST HOUR: WHAT I CANNOT ANSWER AFTER READING THE QUARTET

Written **before** opening any code, per the brief. These are the questions a newcomer
still holds after `ORIENTATION → README → ARCHITECTURE → FEATURES → BACKLOG → NOTES`.
⭐ **This list is the outline of the spine.** Each numbered item is a section
`ORIENTATION.md` must answer or the next agent asks it again.

### A. Identity — what is a tree called, and which name wins?
1. **What is the canonical id for a species?** The docs use, interchangeably and
   without a stated rule: botanical (`acer_saccharum`, `quercus_alba`,
   `tilia_americana`), roster-slug (`oak_pin`, `ash_green` — `slugifyRoster`),
   and bake-style (`maple_sugar`, `oak_white`, `linden_american`). NOTES 2026-07-07
   says the map was repointed *from* the botanical namespace *to* `oak_white`/
   `maple_sugar` — but `ORIENTATION §two seams` still describes the census/grove
   mismatch as the highest-value open fix, and BACKLOG 2026-08-22 measures
   `tilia_americana`. **Is the botanical namespace dead, live, or half-migrated?**
2. **What are the FOUR name-spaces for, respectively?** `park_trees.json` raw roster
   name → `roster-name-canon.json` canonical name → `slugifyRoster` canonical id →
   `park_species_map.json` routing → library id → chassis file name. That is five
   hops and no doc draws them in one line. Which are authored, which derived?
3. **Which is canonical between a species and its bake-style twin?** The brief's
   Ghost 1 (`acer_saccharum` vs `maple_sugar`) is the instance; the *rule* is what
   is missing.
4. **What does the `_lowpoly` / `_multistem` / `_procedural` suffix MEAN?** Is it a
   variant of one species, a separate species, or a build-style? Nothing says.

### B. The pool — what is the library FOR?
5. **What is `public/trees/` — a library, a graveyard, or a cache?** `FEATURES
   §Full monte` calls it "gitignored authoring pool, never read by runtime"; the
   Grove reads it; the brief measures 79 species there against 10 baked. **What is
   the intended relationship between the 79 and the 10?**
6. **How does a species LEAVE the pool?** There is a NO-FILLER gate at index-build
   and a Demote vocabulary in doctrine, but I cannot tell what actually removes
   something, or whether anything ever has been removed.
7. **What is `public/trees/_chassis/` vs `public/library/` vs `arborist/state/`?**
   All three are called the parts store by some doc.

### C. The surfaces — eleven of them, and what each is FOR
8. **How many surfaces are there, actually?** README's table lists 6 (Salon, Grove,
   Coverage, Library, Procedural, LiDAR). FEATURES documents Scan, Procedural,
   Salon, LiDAR, Grove, Coverage. The brief says **eleven workstages** in
   `src/arborist/`. **I cannot name eleven from the docs.** Which are reachable,
   which are URL-only, which are dead?
9. **Which artifact does each surface read?** The brief calls this the highest-value
   sentence in the document (Ghost 4) and I confirm: **no doc states it.** I can
   infer Salon = fresh build, Grove = pool, diorama = bake — only from the brief.
10. **What is `Library` as a surface?** README lists it as a mode whose code is a
    markdown file (`INVENTORY.md`, "rendered view pending"). Is it a surface or not?
11. **Is `Shelves` a surface?** `ORIENTATION` says it was BUILT 2026-07-11
    (`f1496661`) and is the composition workspace. It appears in **no other doc**,
    including README's surface table and FEATURES.
12. **Coverage vs Shelves vs the roster navigator** — three "what do we have vs
    need" surfaces are described. Are they three, or one thing described thrice?

### D. The matcher — built, ripped out, or both?
13. **Does the matcher exist?** `README §START HERE` says the kit-matcher front IS
    the current build and names `matcher.js`. `ORIENTATION` says *"No Recommended
    toggle, no matcher"* and *"the old matcher/ranking is ripped out."* `FEATURES`
    documents `/salon/:id/options` returning **ranked** options. **All three are
    live docs.** This is the single loudest contradiction in the corpus and I cannot
    resolve it from the docs.
14. **Is `scratch/FOREST-BUILDER-KIT-MATCHER.md` canon or archive?** README calls it
    "the live design" and puts it FIRST in its read order; `ORIENTATION` says it is
    an archived design record, superseded. `ARCHITECTURE §Phase F` points at it as
    the **live home** for leaf colour.

### E. The pipeline — one gesture or two?
15. **Does the Grove bake regenerate from source?** `ARCHITECTURE §Salon parity`
    contains BOTH: a 2026-06-25 header saying Gap 2 is CLOSED (`15682e55`) and, 20
    lines below, an "AS-BUILT REALITY" block saying `/grove/bake` **never** calls
    `generate-salon`. `README` reproduces the OPEN version as today's troubleshooting
    advice. **The two answers imply opposite operator instructions.**
16. **Is there a per-species Re-publish gesture?** Retired per five separate doc
    passages; `FEATURES §Grove population` still instructs the operator to use it.
17. **Which bake command is real?** `README` + `FEATURES` say
    `bake-trees.js --look <id>`; `NOTES` 2026-07-15 says `--look` **no longer
    exists**, it is `--scene`. Both are live docs.
18. **What is a "Look" vs a "scene" vs a "neighborhood"?** Used as synonyms and as
    distinct things in the same paragraph.

### F. What actually ships
19. **All-mesh or impostor-foundation?** `ARCHITECTURE §Tree-render reality` and
    `FEATURES §What ships today` say impostor-is-the-foundation, tallest 15% mesh.
    `ARCHITECTURE §Configuration D` says *"Trees ship all-mesh … PROM_THRESHOLD=0
    … there is no points-canopy"*. `NOTES 2026-06-25` says ALL-MESH and impostor
    PARKED. **This is the exact ghost that cost Jacob a month** (`BACKLOG`,
    `c8c85a1a` fixed one copy) — and I count at least two more copies still live.
20. **Which of the three impostor systems is which, and is any killed?**
    `impostorBySpecies` (killed), `overheadBySpecies`, `heroImpostorBySpecies`. The
    table is clear in ARCHITECTURE; nothing else in the corpus reflects it.
21. **What is the standard for a bake?** The brief's Ghost 5 — linden 12.4 MB vs
    plane 0.3 MB. No doc states a target weight, tri budget, or what "correctly
    baked" means. **So no bake can be called wrong.**

### G. Authored vs derived vs baked vs per-operator
22. **Where does each authored value live, and what invalidates it?** I can name
    `compositions.json`, `design.json#/trees`, `park_species_map.json`,
    `_chassis-curation.json`, `roster-name-canon.json`, `mature-heights.json`,
    `rubric.json`, `dossiers/`, `leaf-pack-bindings.json`, `decimation-defaults.json`
    — but **no doc says which are operator-authored vs generated**, or which are
    invalidated by a bake.
23. **What is per-operator (localStorage) vs authored?** Only the canary is stated.
24. **Is `quality` / `qualityOverride` live?** Doctrine retired the 0–4 scale;
    `ORIENTATION` says the code still carries it; three docs still reason from it.

### H. Owed / abandoned
25. **What is the state of the habit-tagging pass?** "~5 of 241 classified" (2026-07-11)
    and "80-chassis habit-untag backlog" (Stage-0 note) are both live numbers and
    they disagree about the denominator.
26. **Is `OPERATIONS.md` owed?** Named as the operator manual in `ORIENTATION`'s read
    order with "(To be written.)"; `NOTES` calls it a doc-structure gap. **Owed, or
    abandoned?** ⛔ This is an ASPIRATION-class call — Jacob's.
27. **Procedural + LiDAR: "kept as equal peer tracks" or dead?** Every doc says
    kept-not-retired; `ORIENTATION` also says "our procedural generator is not
    usable and its workspace is hidden," and the no-filler gate now hard-gates
    procedural assets out of the pool. **Kept how, if nothing it makes may ship?**
    ⛔ ASPIRATION-class — Jacob's call.
28. **Is the Scan workstage alive?** Called "legacy/deprecating" in 2026-05; its full
    knob surface is still documented in FEATURES.
29. **What is the `?legacy=` URL surface, complete?** Four params are named across
    two docs; nothing lists them together.
30. **What happened to Phase E (monopodial conifer)?** "pending", "priority-dropped",
    and conifers-ship-as-substituted-broadleaves all appear. ⛔ ASPIRATION-class.

### I. Structural
31. **What is the quartet, actually?** Every doc's header says the quartet is
    FEATURES/ARCHITECTURE/BACKLOG/NOTES — but `ORIENTATION` and `README` sit above
    them, and there are **ten** live `.md` files in `arborist/`. `SPEC.md` (620
    lines) and `STAGE0-KEYSTONE.md` and `LIBRARY-BUILDER.md` are listed as
    **archived** by `ORIENTATION`'s footer while sitting live in the directory.
32. **Which doc is the front door?** `ORIENTATION` claims it and says it supersedes
    the competing framings; `README` opens by pointing at ORIENTATION but then
    carries its own `⭐ START HERE`; `FEATURES` and `ARCHITECTURE` both point at
    `README §⭐ START HERE` as the front door. ⭐ **Three front doors, and the
    disease `ORIENTATION` names in its own second paragraph.**
33. **How does an Arborist doc relate to the root-level ones?** `SALON-INTERFACE.md`,
    `TREE-INTAKE.md`, `SHOW-BIBLE.md`, `HIPOINTE-DEMUN-ROSTER.md` live at repo root
    and are cited as live Arborist canon.

---

## §1 — FINDINGS LEDGER

*(populated as I verify — entries below this line carry file:line + the command.)*

### Calibration pass — the brief's own premises, checked *(Wren)*

| brief claim | measured | verdict |
|---|---|---|
| `arborist/*.js` 39 files / 15,247 lines | 39 / 15,247 | ✅ exact |
| `src/arborist/*.jsx` 14 files / 9,315 lines | 14 / **9,333** | ✅ (drifted +18) |
| `serve.js` 1,833 lines | 1,833 | ✅ |
| Ghost 1 — 4 `saccharum` ids + `maple_sugar` | confirmed | ✅ |
| Ghost 2 — 79 pooled / 10 baked | 79 / 10 | ✅ **and a third number: `index.json` carries 65** |
| Ghost 3 — `/forest`, `/readiness` absent | 0 / 0 | ✅ |
| ⛔ **"eleven workstages in `src/arborist/`"** (§2.A.2) | **there are 7 mountable surfaces**, in 14 files | ❌ **WRONG PREMISE — see F-01** |

---

## F-01 · `BRIEF-arborist-exorcism.md §2.A.2` · **the brief miscounts the surfaces**
- **Claims:** "There are eleven workstages in `src/arborist/`."
- **Code:** `src/arborist/` holds 14 files, of which **7 are mountable surfaces**
  (`ArboristApp.jsx:100-107` is the whole router): `SalonWorkstage` (default) ·
  `Workstage` (Scan) · `ProceduralWorkstage` · `LidarWorkstage` · `ShelvesWorkstage` ·
  `Grove` · and `?view=fullmonte` → `src/components/TreeDiorama.jsx` (**not** in
  `src/arborist/`). The rest are **not surfaces**: `CoverageView` is a view *inside*
  Grove; `OverheadBaker` + `HeroImpostorBaker` are headless RTT bakers; `SpecimenViewport`,
  `ChassisPlate`, `chassisForms`, `main` are components.
- ▶ `grep -n "if (.*Open) return\|return <" src/arborist/ArboristApp.jsx`
- **Smallest change:** the spine says **seven surfaces + one embedded view + two bakers**.

## F-02 · `README.md:CLI` + `FEATURES.md:CLI` · **ROT** · `bake-trees.js --look <id>`
- **Claims:** ship-to-slab is `node arborist/bake-trees.js --look <id>` (both docs, and
  `README §Contract` "Ship-to-slab").
- **Code:** `arborist/bake-trees.js:10,23` — the flag is **`--scene`**; "`--scene` was
  named `--look` until 2026-07-15; it always meant the scene." `bake-look.js:1422`
  still takes `--look`, so the two commands in the same doc row take *different* flags.
- ▶ `grep -n "\-\-scene\|\-\-look" arborist/bake-trees.js arborist/bake-look.js`
- **Smallest change:** `bake-trees.js --scene <name>` in both CLI tables + `README §Contract`.
  (`NOTES.md` already carries the correction — the front-door docs never got it.)

## F-03 · `README.md §Grove → Slab` (troubleshooting block) + `ARCHITECTURE.md §Salon parity`
   (the "AS-BUILT REALITY" block) · **ROT — and it is live operator instruction**
- **Claims:** "`/grove/bake` calls **only** `bakeLook + bakeTrees` — it **never** calls
  `generate-salon`… **Fix today:** `POST /salon/:id/publish` **each** edited species,
  *then* `/grove/bake`."
- **Code:** `serve.js:1156-1216` — `/grove/bake` step 1 **is** `execAsync('node',
  [generate-salon.js])` over all species, then `rebuildIndex()`, then `bakeLook`, then
  `bakeTrees`. Gap 2 is closed. The same ARCHITECTURE section's own 2026-06-25 header
  says so, **20 lines above the block that contradicts it**.
- ▶ `sed -n '1156,1216p' arborist/serve.js`
- **Smallest change:** excise the AS-BUILT block + the README troubleshooting block to
  `_archive/` (dated). ⛔ Per `CLAUDE.md`: **excise the sentence, don't add a banner** —
  the banner is already there and the false text outlived it.

## F-04 · `ARCHITECTURE.md §"Configuration D canopy render"` + `NOTES.md 2026-06-25 (EOD)`
   · **ROT** · **"trees ship ALL-MESH"** — *the ghost that cost a month, ×2 more copies*
- **Claims:** "Trees ship **all-mesh**: every visible placement is a full lod1 mesh tree
  (`bake-trees.js#PROM_THRESHOLD=0`)" · "the impostor/RTT arc is **PARKED**".
- **Code:** both halves of the picture are real and the docs quote only the dead half.
  `PROM_THRESHOLD = 0` is genuinely still `0` (`bake-trees.js:233`) — **but that is the
  legacy bake-time classifier.** The live split is at **runtime**:
  `InstancedTrees.jsx:665` `heroFoundationEnabled = !!heroImpostorRecords && …`, `:669`
  `heroGeomFraction` default **0.15**. And the LS bake **carries the records** —
  `heroImpostorBySpecies` has **9** species, `overheadBySpecies` **7**. So LS ships
  impostor-foundation, exactly as `§Tree-render reality` and `FEATURES` say.
- ▶ `node -e "const j=require('./public/baked/lafayette-square/trees-atlas.json');for(const k of ['overheadBySpecies','heroImpostorBySpecies'])console.log(k,Object.keys(j[k]).length)"`
- **Smallest change:** delete the all-mesh sentence from `ARCHITECTURE §Configuration D`
  (keep the "no points-canopy" ruling, which is still true) and archive the
  `NOTES 2026-06-25 (EOD)` bullet. ⭐ `BACKLOG`'s copy was fixed in `c8c85a1a`; **these
  two were missed.** Same sentence, three homes — that is why it survived.

## F-05 · `BACKLOG.md §CURRENT ARC` (+3 more docs) · **ROT** · `GET /forest` / `GET /readiness`
- **Claims:** "`GET /readiness` & **`GET /forest`** (rendered dashboard, :3334) …
  **Eye it: `:3334/forest`**".
- **Code:** neither route exists (`grep -c "/forest" arborist/serve.js` → 0). **git is the
  discriminator and it is unambiguous:** built in `9145e1ab` / `f86189b2`, then
  **deliberately removed** in `0402dee5` *"fold per-part readiness into the Grove's
  Coverage view; drop /forest"*. Not a regression — a decision.
- ▶ `git log --oneline -S"'/forest'" -- arborist/serve.js`
- **Smallest change:** repoint every `/forest` + `/readiness` citation at the **Grove →
  Coverage** view. ⚠️ `readiness.js` + `matcher.js` still exist and are still *used* —
  by `GET /coverage` and `GET /salon/:id/options`. Do **not** delete the modules.

## F-06 · `ORIENTATION.md` vs `README.md` vs `FEATURES.md` · **the matcher — NOT ROT**
- `ORIENTATION`: *"No Recommended toggle, no matcher"* / *"the old matcher/ranking is
  ripped out."* `README §START HERE`: the kit-matcher front **is** the current build.
  `FEATURES`: `/salon/:id/options` returns **ranked** options.
- **Code:** `arborist/matcher.js` exists and is live — `serve.js:1077` (`/coverage` →
  `computeCoverage` via the matcher) and `:1299` (`/salon/:species/options` — "the Forest
  Builder matcher's **ranked** options"). ⭐ **So all three docs are describing different
  things with one word.** What was ripped out is the *Recommended-vs-Show-all UI toggle*
  and the per-species **score**; the ranking **module** is load-bearing for two endpoints.
- **Smallest change:** the spine names them apart — *the matcher (module, live, ranks
  parts for two endpoints)* vs *recommendation (the retired UI framing)*. ⛔ Anyone
  "finishing the rip-out" on `ORIENTATION`'s wording breaks `/coverage`.

## F-07 · `ORIENTATION.md` footer + the directory · **ASPIRATION? — ⛔ JACOB'S CALL**
- **Claims:** `ORIENTATION`'s closing line lists `SPEC.md`, `STAGE0-KEYSTONE.md`,
  `LIBRARY-BUILDER.md` as *"Archived design records (history, not canon)."*
- **Reality:** all three are **live files in `arborist/`** (620 + 92 + 66 = 778 lines,
  28% of the live doc corpus). `serve.js:5` cites `SPEC.md` as the endpoint contract.
- **Why I am not calling it:** "already archived" reads as ROT, but the sentence may be a
  **decision that was made and never executed** — in which case executing it is the fix,
  not deleting the sentence. ⛔ **STOP: ROT or ASPIRATION is Jacob's.**

## F-08 · `ARCHITECTURE.md:~92,94` · **ROT (mechanical)** · the GPU-gauge paragraph is duplicated
- The 5-line "⚠️ The GPU 'gauge' is NOT a perf signal" block appears **twice, verbatim,
  back to back.** ▶ `grep -c 'The Preview emulator gauge is a count-vs' arborist/ARCHITECTURE.md` → 2
- **Smallest change:** delete one.

## F-09 · `ARCHITECTURE.md §Tree-render reality` · **not a doc bug — a live dead-weight note**
- Doc: `impostorBySpecies` (the octahedral cross) is **"KILLED, not parked."**
- **Code:** `bake-look.js` still **emits** it — the LS `trees-atlas.json` carries
  `impostorBySpecies` (10 species) *and* `opaqueBySpecies` (10). `InstancedTrees.jsx:817`
  still reads it, gated on `inst.heroTier === 'impostor'` — which `PROM_THRESHOLD = 0`
  makes unreachable (`bake-trees.js:407`, every placement classifies `mesh`).
- **So: dead by DATA, not by code.** The doc is right about intent and silent about the
  fact that the killed system is still being baked into every slab.
- **Smallest change:** phase-2 candidate — stop emitting both keys, delete `ImpostorSpecies`.
  ⛔ Not phase 1, and it is a capability removal → needs Jacob.

## F-10 · `FEATURES` · `ARCHITECTURE` · `BACKLOG` · `NOTES` · `ROSTER-COVERAGE` · **ROT**
   **· the census and the routing map moved to PER-SCENE; five docs still name the dead global paths**
- **Claims (all five docs):** the census is `src/data/park_trees.json` and the routing
  source of truth is `src/data/park_species_map.json`.
- **Neither file exists.** ▶ `ls src/data/park_trees.json src/data/park_species_map.json`
- **Code — the live shape is per-neighbourhood:**
  - census → `cartograph/data/<scene>/clean/park_trees.json` (`tree-bake-inputs.mjs:112`)
  - routing → `cartograph/data/<scene>/tree-species-map.json` (`roster-coverage.js:49`,
    `parkMapForScene`)
  - ▶ `for s in lafayette-square hipointe-demun ksi-y-m-yn; do echo -n "$s "; node -e "console.log(Object.keys(require('./cartograph/data/$s/tree-species-map.json').map).length)"; done`
    → **182 · 231 · 15 routes.** All present.
- **Why it moved (`tree-bake-inputs.mjs:78-83`):** LS used to short-circuit to built-in
  `src/data/*` defaults *"its census, species map and hardscape mask predated scenes."*
  **Retired 2026-07-16** — LS now falls through the ordinary per-hood path *"like every
  other neighbourhood — one intake path, no special case."*
- ⭐⭐ **This is the single most important correction in the ledger and it is a LAYER 0
  fact, not a path fix.** The docs describe a kit whose tree routing is a global LS file.
  The code is a kit whose tree routing is per-town. **Every doc still teaches the
  instance-shaped model that was deliberately removed.** Anyone reasoning from the docs
  about "the species-key seam" is reasoning about a file that is gone.
- **Smallest change:** the spine states the per-scene paths; the five docs' path strings
  are corrected in the same pass. ⭐ Prefer the **command** over the paths.

## F-11 · `cartograph/tree-bake-inputs.mjs:120-121` · **ROT (a stale comment promising a fallback)**
- **Comment claims:** *"Per-scene species routing… absent → bake-trees falls back to LS's
  global map."*
- **Code:** that global map is the file F-10 shows no longer exists. Absent → `speciesMapPath
  = undefined` (`:122`) → `bake-trees.js:523` `mapPath ? read : { map: {} }` → **an empty
  map, silently.** Every placement then routes by `CATEGORY_FALLBACK`.
- ⚠️ **`bake-trees.js:487` says this is intentional** — *"an empty map simply expresses no
  routing"* — so the *behaviour* may be correct and honest. **It is the comment that lies**,
  and it lies in the direction Layer 0 forbids: it tells the reader a safety net exists.
- **Smallest change:** delete the fallback clause from the comment. ⛔ Do **not** "restore"
  the fallback — a global LS map reaching town #2 is the bleed we already excised.

## F-12 · **SPINE FACT (no doc states it)** · the eligibility rule: **authored ⇒ ships**
- The pool splits into four populations, and no doc names them:
  | | count | what it is |
  |---|---|---|
  | `public/trees/*/` dirs | **77** | every species ever published — the **authoring pool** |
  | `index.json .species` | **65** | the **catalog** (post NO-FILLER gate) |
  | `index.json .variants` | **37** across **23** species | the **shippable** set — this is `bake-trees`' pool (`:685`) |
  | `baked/lafayette-square/trees/` | **10** | what LS actually ships |
- ⭐ **The rule that separates 23 from 10 is: does the species have an authored
  `arborist/state/<id>/compositions.json`?** 9 of the 10 baked are authored; **every**
  un-baked one of the 23 is raw. **One exception each way** — see F-13 and the
  `platanus_acerifolia` note below.
- ▶ `node -e "…"` (see the ledger's calibration script) — regenerable, so the spine
  carries the command, not the four numbers.
- **`platanus_acerifolia` is the raw-but-baked exception** — the merged London plane. It
  is also the 0.3 MB / 8,761-vert outlier in the brief's Ghost 5 **and** the species
  `ARCHITECTURE` names as baking BLANK overhead bands *"because only Salon-composed
  species get a `barkDetailBySpecies` record."* ⭐ **Ghost 5 is not a mystery: the thin
  bakes are the un-composed species.** Same root, three reported symptoms.

## F-13 · `arborist/state/acer_saccharum/compositions.json` · ⛔ **STRANDED AUTHORING**
- **`acer_saccharum` is AUTHORED (composition dated 2026-07-10) and is the only authored
  species that never bakes.** It is routed **nowhere** in the LS map, while its twin
  `maple_sugar` (authored 2026-07-23) carries 4 roster names and ships.
- ▶ `node -e "const m=require('./cartograph/data/lafayette-square/tree-species-map.json').map;const t={};for(const[k,v]of Object.entries(m))for(const i of v||[])(t[i]??=[]).push(k);console.log('acer_saccharum:',t.acer_saccharum||'NOT ROUTED','| maple_sugar:',(t.maple_sugar||[]).length)"`
- ⛔ **Layer 0 question 3 applied, and it points the OTHER way:** this is not the kit
  calling authoring a defect — it is **authoring the kit cannot deliver.** Someone
  composed sugar maple under the botanical id after the namespace moved to `maple_sugar`,
  and that work has no path to the map. **The same is true of the other three botanical
  twins** (`quercus_alba` 3 variants, `nyssa_sylvatica` 4, `betula_pendula` 5) — all
  raw, all shadowing a shipped roster-named species.
- **This is Ghost 1, measured.** `/grove` serving both is not cosmetic: one of the two is
  a dead end, and nothing on the surface says which.
- ⛔ **STOP — Jacob's call.** Retiring the botanical twins removes published variants.
  ROT (the old namespace, evict) or ASPIRATION (botanical ids were the intended
  destination — `roster-coverage.js:61` still says the operator *"can rename to a
  botanical id … afterward"*)? **I cannot tell, and guessing deletes either work or a
  decision.**

## F-14 · `arborist/roster-coverage.js:50` · **REGRESSION** · **Coverage reads ONE census
   well; the bake reads FIVE.** *The same bug, already fixed twice, live in a third site.*
- **Code:** `parkTreesForScene = … 'clean', 'park_census.json'` — a **single** well.
  `cartograph/tree-bake-inputs.mjs:110-116` reads **five**, of which LS has three:
  `park_census.json` (756) · `park_trees.json` (2,635) · `osm_trees.json` (3,376).
- **Measured blind spot:** **92 species names / 1,300 placements** appear in the bake's
  wells and are **absent from Coverage's list entirely** — Freeman Maple (179), Hybrid Elm
  (120), American Mountainash (76), Frontier Elm (55)…
  ▶ (script in the session log; re-derivable from the three well paths)
- ⭐⭐ **`tree-bake-inputs.mjs:103-108` documents this exact bug class being fixed:**
  *"Two entry points, two disjoint answers, each silently dropping what the other kept…
  which is what shipped, so LS showed 729 park trees and no street trees at all. **Add new
  wells to BOTH.**"* — **`roster-coverage.js` is the third entry point and it was not
  added to.** The warning names the fix and the fix did not reach here.
- **Smallest change:** `roster-coverage.js` resolves its census through
  `treeBakeInputsForScene(scene)` — ⭐ **one enumeration of what a census is**, which is
  what the comment already asks for. ⛔ Not a fourth copy of the well list.
- ⚠️ **This is why the doc corpus quotes six different placement counts** (700+ · 745 ·
  756 · 2,635 · 5,641 · 6,967). They are different wells, and no doc says so.

## F-15 · `arborist/roster-coverage.js:139-140` · **REGRESSION** · **Coverage shows a green
   ✓ for a route that CANNOT ship** — a plausible-looking success in the instrument
- **Code:** `libExists(id) = published.has(id) || chassisCount>0 || compositions.has(id)`.
  A **procedural filler** still has chassis on disk, so `libExists` is **true** — but the
  NO-FILLER gate excluded it from `index.json`, and `index.variants` is exactly the pool
  `bake-trees.js:685#pickVariant` draws from. **So the route resolves in Coverage and
  evaporates in the bake.**
- **Measured on LS:** **40 roster rows / 275 placements** route at `procedural_*` or
  `generic_tree_2`. **Coverage flags 0 of them dangling.** Every one renders `✓`.
  ▶ `node --input-type=module -e "import {computeCoverage} from './arborist/roster-coverage.js'; const c=await computeCoverage('lafayette-square'); const f=c.species.filter(r=>(r.routing||[]).some(x=>/^procedural_|^generic_/.test(x.libId))); console.log(f.length,'rows',f.reduce((a,r)=>a+r.count,0),'placements | flagged dangling:',f.filter(r=>r.dangling?.length).length)"`
- ⛔⛔ **This is Layer 0 question 2 committed by an instrument** — the same shape as
  `litmus-curb-parallel`. The operator asks "is this species covered?", the tool says yes,
  and the bake quietly substitutes something else. **Silence is the defect.**
- ⭐ **And it is kit-general, not LS-shaped:** any town whose map points at a filler gets
  the same false green. HiPointe's map has 231 routes — unmeasured here.
- **Smallest change:** `libExists` must mean *"can this id actually produce a tree"* —
  i.e. **`published` = has a variant in `index.variants`**, with chassis/compositions
  reported as a distinct, **loud** state (*authored but not published*), never as ✓.

## F-16 · **SPINE FACT — WHICH ARTIFACT EACH SURFACE READS** *(brief §A.4 / Ghost 4)*
**Measured, not inferred. This exists in no doc. Six of the seven surfaces read a
different artifact from the one that ships.**

| surface | reads | at | source |
|---|---|---|---|
| **Salon** | a **freshly built preview** — POSTs `{chassis,bark,leaves}`, gets back a per-composition GLB + atlas | authoring density | `SalonWorkstage.jsx:614` → `POST /salon/:sp/:slot/preview-atlas` |
| **Grove — gallery** | the **source pool** `/trees/<sp>/<lod0>` | **lod0** | `serve.js:354` (`GET /grove`) |
| **Grove — impostor bakers** | the **bake** `baked/<look>/trees/<sp>/skeleton-N-**lod1**.glb` | **lod1** | `Grove.jsx:142` |
| **Shelves** | the **chassis library** `public/trees/_chassis/` (no species, no bake) | — | `ShelvesWorkstage.jsx:207` |
| **Coverage** | **no geometry** — `GET /coverage` (a join over census × map × `index.json`) | — | `CoverageView.jsx:35` |
| **Diorama** (`?view=fullmonte` / `?embed=tree`) | the **bake** `baked/<look>/trees/<sp>/skeleton-1-**lod0**.glb`, default `linden_american` | **lod0** | `TreeDiorama.jsx:411`, `:57-59` |
| **LS runtime** | the **bake** + the impostor records | **lod1** mesh anchors + impostors | `InstancedTrees.jsx` |
| Procedural / LiDAR / Scan | their own generators (`POST /procedural/generate`, `lidar/*/extract`, `.ply`) | — | peer/legacy tracks |

⭐ **Three things fall out of this table that no doc says:**
1. **The Grove reads two different artifacts at two different LODs — inside one surface.**
   The tiles the operator judges are **lod0 from the authoring pool**; the impostor
   captures that actually ship are made from **lod1 out of the bake**. `Grove.jsx:139`
   claims *"capture parity with the runtime"* — true of the **capture**, and not of the
   **gallery beside it.** ⛔ So "the Grove and the map disagree" is expected, and it is
   currently indistinguishable from a defect.
2. **The Salon↔diorama gap is by design and is now precisely nameable:** Salon = a build
   that never existed on disk; diorama = the frozen file. `BACKLOG` 2026-08-23 already
   ruled this ("the diorama looking worse than the Salon is the system WORKING"). ⭐ **It
   belongs in the spine as a rule, not as a dated incident**, or it is rediscovered.
3. **`lod0` vs `lod1` is a THIRD axis of disagreement** nobody has named. Salon (authoring
   density) · Grove gallery (lod0) · diorama (lod0) · Grove capture + LS (lod1). Four
   surfaces, three densities.

## F-17 · `serve.js:322` · **SPINE FACT + a live blind spot** · the Grove cannot see one
   species that ships
- **The eligibility rule F-12 derived is stated in the code, verbatim:**
  `serve.js:322` — `if (!hasComposition(speciesId)) continue   // ELIGIBLE = composed only`
  (and `:321` drops fillers). ⭐ So the rule is real, enforced, and cited to
  `README §Grove → Slab` — it is simply **absent from every prose doc.**
- ⛔ **But the gate is applied to the GALLERY, and the BAKE does not share it.**
  Measured: 10 species ship to LS; **9** are visible in the Grove.
  **`platanus_acerifolia` ships and is invisible in the Grove.**
  ▶ `node --input-type=module -e "import fs from 'fs';const b=fs.readdirSync('public/baked/lafayette-square/trees').filter(n=>!/hero-impostor|overhead/.test(n));console.log(b.filter(s=>!fs.existsSync('arborist/state/'+s+'/compositions.json')))"`
- ⭐⭐ **And it is the WORST one.** Same species as F-12's raw-but-baked exception: the
  0.3 MB / 8,761-vert outlier of Ghost 5, and the one `ARCHITECTURE` names as baking
  **blank overhead bands**. **The surface whose single job is "cull in context" is blind
  to the one specimen most in need of it.**
- **Smallest change:** the Grove shows **everything in the Look's roster**, marking
  un-composed species as a distinct loud state — never by hiding them. ⛔ Hiding a
  shipping species from the curation surface is Layer 0 question 2.

---

## ⚖️ JACOB'S RULINGS — 2026-08-23

**R-1 · "The diorama looking worse than the Salon is the system WORKING."** — ⛔ **NOT
Jacob's, and he does not accept it.** The sentence is `BACKLOG.md` 2026-08-23, written by
the previous session; **Wren mis-attributed it to Jacob and he corrected it.**
- **What survives (measured):** the Salon builds a fresh preview, the diorama loads the
  frozen bake (F-16), and the baked linden is 12.4 MB against maple's 3.2 MB.
- **What does NOT survive:** the inference *"therefore the system is working."* **A bake
  that thin is a defect in the bake.** ⛔ The spine carries the artifact difference as a
  fact and takes **no** position that the gap is correct.
- ⭐ **Lesson for this ledger:** a doc's editorial sentence is not a ruling. `CLAUDE.md`
  already says a doc is a claim — **including a doc that sounds like the operator.**

**R-2 · PROCEDURAL AND LIDAR ARE ROT.** *(Jacob, verbatim: "We are NOT using procedural
OR LiDar so anything taking up space or confusing things or getting in the way or being
deceptively heavy is 100% rot.")*
- ⭐ This **closes** ledger questions §H-27, §H-28, §H-30 and supersedes the "kept as
  equal peer tracks" doctrine carried by `README`, `FEATURES`, `ARCHITECTURE` and
  `ORIENTATION`. **Those four passages are now ROT by ruling, not by inference.**

### R-2 blast radius — measured, phase 2 work

| | lines / size | note |
|---|---|---|
| `LidarWorkstage.jsx` · `ProceduralWorkstage.jsx` · `Workstage.jsx` (Scan) | **3,498** | ⛔ **statically imported at `ArboristApp.jsx:37-40` → they are in the deployed `arborist.html` bundle** |
| `lil_vera.py` 2,123 · `lil_vera_v2.py` 1,507 · `bidirectional_skeleton.py` 418 · `lidar_extract.py` 239 · `bake-tree.py` 381 · `lidar-publish.js` 191 | **4,859** | LiDAR backend |
| `generate-procedural.js` 1,240 · `spaceColonization.js` 747 | **1,987** | procedural backend |
| `serve.js` lidar/procedural/seedling routes | **~715 of 1,833** | **39% of the backend** |
| **code total** | **≈ 11,059 lines** | ~28% of the ~25k surface with **zero product reach** |
| `botanica/` (FOR-species20K corpus) | **103 GB** | untracked, but this is the literal "deceptively heavy" |
| doc lines naming them | `FEATURES` 48 · `ARCHITECTURE` 35 · `SPEC` 22 · `NOTES` 6 · `README` 6 · `ORIENTATION` 4 · `ROSTER-COVERAGE` 4 | |
| **LS routing map** | **49 roster names** → `procedural_ornamental` (40) · `procedural_conifer` (5) · `procedural_columnar` (4) | see F-15 |

⭐⭐ **R-2 resolves F-15's defect at the root.** Coverage's false ✓ on 40 rows / 275
placements is entirely a **procedural-filler** artefact. **Repoint those 49 routes and the
false green disappears without touching `libExists`.** ⛔ Fix `libExists` too — the class
survives the instance (a `generic_tree_2` route does the same thing, and it is not
procedural).

⚠️ **Two things R-2 does NOT settle, flagged rather than assumed:**
1. **`generic_tree_2` carries 57 roster names / 489 placements** — the single largest
   routing target on LS. It is *generic*, not *procedural*, so **R-2 does not reach it by
   its own words.** ⛔ Same rot, or a legitimate stand-in? **Not assuming.**
2. **`Workstage.jsx` (Scan) is LiDAR-fed** (it reads `tree_metadata_dev.csv` +
   `preview.ply`) so R-2 plainly reaches it — but it is **also `ArboristApp.jsx:106`'s
   fallback route** (`if (activeSpeciesId) return <Workstage />`). Removing it changes
   what happens when a species id is set. **A wiring question for phase 2, not a doubt
   about the ruling.**

## F-18 · `ARCHITECTURE.md:158` · **ASPIRATION → now moot under R-2**
- **Claims:** *"Monopodial whorl — `arborist/monopodialWhorl.js` (Phase E, pending)"*, with
  a full algorithm spec and a `generateTreeMesh()` integration note.
- **The file has never existed.** ▶ `ls arborist/monopodialWhorl.js` → No such file.
- An unbuilt design filed beside built ones — textbook ASPIRATION. **R-2 retires it**;
  logged so the archive records that Phase E was *specced and never written*, not lost.

---

## ⭐⭐⭐ F-19 · **THE SPINE'S FIRST PARAGRAPH — WHY THE MIXER CANNOT MAKE GOOD YET**
*(Jacob, 2026-08-23: "The kit has become a leaf, bark and chassis mixer. The idea is that
we don't* have *to have literal trees of every species because we have the constituent
pieces for most everything. Currently, we don't have a rational way to make good on that
workflow.")* **Measured. He is right, and the blocker is nameable to two numbers.**

**The mixer's parts are all present:** 241 chassis · 9 bark refs · 18 leaf packs.
▶ `ls public/trees/_chassis/*.glb | wc -l ; ls -d public/textures/bark/*/ | wc -l ; ls -d public/textures/leaves/shapes/*/ | wc -l`

**Going species → parts needs two joins, and BOTH are near-empty:**

**① The species must declare what it needs — a DOSSIER.** **10 of 84** LS roster species
have one. **74 are invisible to the mixer entirely** — `computeCoverage` returns
`forestBuilder: null` for them, so the kit cannot even state which parts they'd take.
▶ `node --input-type=module -e "import {computeCoverage} from './arborist/roster-coverage.js';const c=await computeCoverage('lafayette-square');console.log(c.species.filter(r=>r.forestBuilder).length,'/',c.species.length)"`

**② The chassis must sit on a SHELF — a ratified `chassis.habit`.** Of **239** chassis:
| | count |
|---|---|
| habit **RATIFIED** (a human called it) | **4** |
| habit **guessed**, `ratified: false` | **155** |
| **no habit at all** | **80** |
▶ `node -e "const p=require('./arborist/state/part-index.json').parts.filter(x=>x.partType==='chassis');const h=x=>x.tags?.['chassis.habit'];console.log('ratified',p.filter(x=>h(x)?.ratified).length,'| valued',p.filter(x=>h(x)?.value).length,'| of',p.length)"`

⭐ **This settles ledger question §H-25 — the two docs that disagreed are BOTH right and
neither says what it counts.** `ORIENTATION`'s *"only ~5 chassis classified"* = the **4
ratified**. `BACKLOG`'s *"80-chassis habit-untag backlog"* = the **80 with no value**. The
155 in between are guesses nobody has looked at.

### ⛔⛔ AND THE GUESS IS CIRCULAR — this is the root, not the tagging backlog
**155 of the 159 habit values are derived from `source.species-botany(<the chassis's own
original species>)`** — i.e. *"this GLB was scanned from a sugar maple, so its habit is
whatever a sugar maple's habit is."*
▶ (source strings are in the tag: `"source.species-botany(acer_saccharum)"` ×18, `(salix_alba)` ×6, …)

**`FEATURES.md §The keying spine` rules the opposite, verbatim:** *"The chassis is **free
geometry** — picking any chassis IS the assignment; **the chassis's own `source.species`
keys nothing.**"*

⇒ **The shelf a chassis sits on was computed from the one field doctrine says means
nothing.** So the mixer can confidently place a chassis **only for species it already had
a literal model of** — which is precisely the capability the mixer exists to remove the
need for. ⭐ **That is the "no rational way to make good on the workflow," located.**

### ⇒ What `generic_tree_2` actually is
**57 roster names / 489 placements.** ⛔ **Not a rot question and not a routing question.**
With 74 of 84 species carrying no dossier and 4 of 239 chassis ratified onto a shelf,
there is **no path from "Hackberry" to a set of parts** — so the map points at a generic
because the mixer has nothing to answer with. **Repointing those 57 routes without ① and
② would be an instance patch** (`CLAUDE.md` Layer 0, question 1).
⭐ **The deliverable is the join, not the routes.**

⚠️ **Namespace note (ties to F-13):** all 10 dossiers are **botanical-named**
(`acer_saccharum`, `quercus_palustris`, `malus_prairifire`) while the shipping trees are
**roster-named** (`maple_sugar`, `oak_white`). **The mixer's demand side and its supply
side are keyed in different namespaces.** ⛔ Still Jacob's call which namespace wins — but
F-13 is no longer a tidy-up: **it sits directly across the mixer's join.**

## ⭐⭐⭐ F-20 · **THERE IS NO "STARTED" — A DEFAULT IS INDISTINGUISHABLE FROM A DECISION**
*(Jacob, 2026-08-23: "what's complete and what's started and what isn't even started")*
**Measured: the kit models no completeness at all, and the reason is structural.**

**The only state vocabulary the code has** is `roster-coverage.js:226`:
```js
authoringState = hasAuthoredChassis ? 'composed' : (markedNotAvailable ? 'not-available' : 'unauthored')
```
⛔ **Three states, and `composed` means *one field is set* — the chassis.** There is no
notion of a composition being finished. **"Started" and "complete" are the same word.**

**And the overlay cannot answer it either, because the effective layer fills the blanks:**
| | overlay (what the operator actually set) | effective (what every surface sees) |
|---|---|---|
| compositions with an explicit **leaf pack** | **2 of 13** | **13 of 13** |
| compositions with an explicit **bark ref** | **4 of 13** | **13 of 13** |
| compositions with **no chassis at all** | **3 of 13** (`honeylocust`, `sycamore_american`, `tuliptree`) | still 3 — the one blank that shows |
▶ overlay: `node -e "…arborist/state/*/compositions.json…"` · effective:
`node --input-type=module -e "import {readEffectiveCompositions} from './arborist/generate-salon.js'; …"`

⭐⭐ **12 of 13 species resolve to the SAME default leaf pack `palmate`; 9 of 13 to the same
default bark `Bark007`.** Only `oak_white` carries a deliberate leaf
(`eastern_black_oak`). **A birch, a blackgum and a linden are all wearing maple-shaped
leaves by default** — and nothing anywhere distinguishes that from an authored choice.
**The LS atlas holds 5 distinct leaf tiles for 10 species.**
▶ `node -e "const j=require('./public/baked/lafayette-square/trees-atlas.json');console.log((j.tiles||[]).filter(t=>/leaf/i.test(t.classification||'')).length)"`

⛔⛔ **THIS IS THE LAYER 0 SHAPE, at the centre of the product.** A default renders as a
plausible tree, so an untouched species and a finished one look identical on every
surface. **The operator cannot see what they have not done.** ⭐ Cousin of
`[[project_a_sentinel_is_not_a_value]]`, inverted: **a default is not an authorship.**

⚠️ **Provenance is missing too:** every baked manifest carries `leafCluster: null` — bark
ref ships (`Bark004`/`Bark007`/`Bark015`), **leaf identity does not.** So the artifact
cannot be asked which leaf it wears. (Same shape as `BACKLOG` 2026-08-22's
`bark: null, leafCluster: null` note — that entry read it as one species' problem; it is
**all ten**.)

### ⇒ The three questions Jacob asked, answered
1. **"How we're even showing the current library"** — **four surfaces show four different
   populations and none is labelled**: Shelves = 241 chassis (4 shelved) · Salon = 84
   roster species · Grove = 9 composed species (⛔ hides `platanus_acerifolia`, which
   ships — F-17) · Coverage = 84 rows against **one** of three census wells (F-14).
2. **"What trees are supposed to go into a locale's species list"** — the census is
   **three wells** (`park_census` 756 · `park_trees` 2,635 · `osm_trees` 3,376 →
   **181 distinct names**). **Coverage shows 89.** ⛔ There is no single answer on screen.
3. **"What's complete / started / not started"** — ⛔ **not modelled.** `composed` = a
   chassis is set; defaults silently supply the rest; **0 of 13 compositions have all
   three parts explicitly authored.**

**Smallest change (phase 2, and it is one change):** ⭐ **make the effective layer report
PROVENANCE per field — `authored` vs `default` vs `absent`.** The resolver already
computes it (`DEFAULTS → CHASSIS_DEFAULTS → overlay`); it simply discards which layer won.
Surfacing that one fact gives every surface *complete / started / not started* for free,
and gives the manifest its missing leaf provenance. ⛔ **Not a new state field to maintain
— a fact the resolver already knows and throws away.**

**R-3 · THE GROVE INVARIANT** *(Jacob, 2026-08-23, verbatim: "It is my desire that when a
tree appears in the Grove it is already baked and ready to go into the slab.")*
⭐ **This is a spine sentence — it defines what the Grove IS, and it is not what it does today.**

**Today, measured:** the Grove is a **PRE-bake** surface. Its gallery reads the **authoring
pool** at lod0 (`serve.js:354` → `/trees/<sp>/<lod0>`), its membership gate is *"has a
composition"* (`serve.js:322`), and **it is where the operator presses "Bake → Slab."**
Under R-3 it becomes a **POST-bake** surface: membership = *is in the slab*.

**What R-3 settles at a stroke:**
- **F-16's split disappears.** Grove gallery and LS runtime read the same baked artifact at
  the same LOD; "the Grove doesn't match the map" stops being possible.
- **F-17's blind spot disappears.** `platanus_acerifolia` ships, so under R-3 it *must*
  appear — and its thin bake becomes visible to the operator's eye instead of hidden.
- **F-12's eligibility rule moves** from *"has a composition"* to *"is baked"* — one fact,
  checkable against the filesystem, not inferred from an authoring file.

⚠️ **Three consequences that must be answered before this is built — I am naming them, not
deciding them:**
1. **Where does the bake gesture go?** It currently lives *in* the Grove. If the Grove is
   post-bake, something else must trigger the bake — the Salon on completion, or a
   separate gesture. ⛔ Un-owned, this becomes "nothing bakes."
2. **The impostor captures are browser-GPU authored INSIDE the Grove** (`OverheadBaker` /
   `HeroImpostorBaker`, `Grove.jsx:120-142`) and `ARCHITECTURE` states they **cannot be
   regenerated by the CLI bake**. A post-bake Grove still has to host them, or they need a
   new home. **This is the load-bearing one.**
3. **What shows a tree that is composed but not yet baked?** Today the Grove is that
   surface. Under R-3 that state needs a home — and per F-20 it is exactly the
   *started-but-not-complete* state the kit currently cannot express. ⭐ **R-3 and F-20 are
   the same missing distinction seen from two sides.**

## ⭐⭐ F-21 · `Grove.jsx:867-1010` · **THE GROVE'S EDITABLE AREA — 3 of 5 controls are dead**
*(Jacob, 2026-08-23: "There is a whole editable area in the Grove, which doesn't even make
sense anymore… built and ripped out repeatedly so it's not even clear what things do or if
they're real/necessary.")* **Measured, control by control.**

`GroveEditorPanel` → `EditorCard` offers **five** affordances on the selected tile:

| control | writes | live? |
|---|---|---|
| **rating — Fill / Mid / Hero** | `qualityOverride` | ⛔ **DEAD by doctrine, near-dead in fact** |
| **category** | `categoryOverride` | ⛔ **never used** |
| **notes** | `operatorNotes` | ⛔ **never used** |
| **In Look toggle** | `design.json#/trees` | ✅ **REAL — this is "atlas inclusion"** |
| **Set as canary** | `localStorage` | ✅ real |

**The measurement, across all 37 shippable variants:**
```
variants carrying an operator qualityOverride : 0
variants carrying operatorNotes               : 0
variants carrying a categoryOverride          : 0
```
▶ `node -e "const v=require('./public/trees/index.json').variants;console.log(v.filter(x=>x.qualityOverride!=null).length, v.filter(x=>x.operatorNotes).length, v.filter(x=>x.categoryOverride!=null).length)"`

**And the rating's only remaining consumer barely fires.** `bake-trees.js:196-200`'s
"quality lottery" decides between candidates only when a roster name routes at **more than
one** shippable variant **with differing quality**: **1 roster name of 182.**
▶ `node -e "…"` (see session log)

⭐ **The rating is the retired 0–4 Fill/Mid/Hero scale.** `ORIENTATION §operating model`
(settled 2026-07-08, with Jacob): *"Vocabulary = Promote / Demote. **No ratings.** The 0–4
Fill/Mid/Hero scale was false precision"* — and *"the code still carries `quality`/
`excluded` under the hood until the vocabulary lands."* **It never landed. The retired
vocabulary is still the Grove's most prominent control.**
- **Class:** ⛔ **REGRESSION-shaped ROT** — a doctrine decision made and never executed, and
  the un-executed half is still on screen soliciting input that nothing reads.
- **Smallest change:** delete rating / category / notes from `EditorCard`. **Zero authored
  values are lost — measured, all three are empty across every variant.** The `quality`
  field stays in the data (`build-index`, `pickVariant`) until Promote/Demote replaces it;
  ⛔ **do not delete `quality` itself in the same pass** — that is a separate, live seam.

## F-22 · **"ATLAS INCLUSION" IS COHERENT — but the Grove cannot see 4 of its 13 entries**
- **Good news, measured:** the Look roster and the slab **agree exactly.**
  `design.json#/trees` = **13 entries**, `trees-atlas.json#rosterSize` = **13**, baked dirs
  = **10 species**. **No drift in either direction.** ⭐ The atlas-inclusion mechanism —
  `In Look` → `design.json#/trees` → `bake-look`'s roster — **is real, is the one that
  matters, and is working.**
  ▶ `node -e "const d=require('./public/looks/lafayette-square/design.json');console.log(d.trees.length, require('./public/baked/lafayette-square/trees-atlas.json').rosterSize)"`
- ⛔ **But the Grove renders 9 species and the roster holds 10** — and the missing one,
  `platanus_acerifolia`, holds **4 of the 13 roster entries** (variants 1–4).
  ⇒ **4 of 13 atlas-inclusion entries are invisible and un-removable in the only surface
  built to edit them.** The `hasComposition` gate (F-17) hides them.
- ⭐⭐ **This is the concrete case for R-3.** Under *"a tree in the Grove is already baked
  and slab-ready,"* the gate becomes **"is it in the roster/slab"** — and those 4 entries
  appear, along with the one specimen whose bake is visibly thin. **R-3 fixes F-17 and F-22
  with the same edit.**

⚠️ **A note on "built and ripped out repeatedly" — this is verifiable, not a feeling.**
The Grove's editor has been: a tile-anchored `<Html>` hover-card → a fixed right-rail panel
(Brief 31) · its quality filter added then retired (Brief 27) · its rating gate demoted to
a "published-not-raw-chassis" filter · Adopt / Re-publish / Oubliette / Studio-Worm removed
(2026-06-25). ⭐ **Each pass removed a CONSUMER and left the CONTROL.** That is the
mechanism behind the flotsam, and it is the thing the spine must state as a rule:
⛔ **when a consumer dies, the control dies in the same commit.**

## ⭐⭐⭐ F-23 · **THE "GOLD BAR" — FOUND. It is in the SALON, and NOTHING READS IT.**
*(Jacob, 2026-08-23, reconstructing its purpose from memory. He is right about what it was
FOR, and it is inert.)*

**It is not in the Grove.** ▶ `grep -niE "gold|amber" src/arborist/Grove.jsx` → **nothing**
(the only gold in `src/arborist/` is LiDAR debug colour — R-2 rot). The Grove's only slider
is **Spread** (`ringScale`, a layout dial).

**It is `groveThreshold` — a draggable cut-line in the Salon's left column**
(`SalonWorkstage.jsx:1613-1633` `RosterNavigator`), with `topN` + `pinned`.

**Its intent is recorded verbatim in the store** (`useArboristStore.js:583-586`) and it is
**exactly what Jacob described**:
> *"Grove build-eligibility bar (perf lever): the top-N species by census count build as
> their own asset; everything below substitutes to a same-category built neighbour at
> runtime. `pinned` species stay IN even below the bar (the once-appearing SPECIAL tree)."*

⛔⛔ **AND NO CONSUMER EXISTS.** The only code that touches `groveThreshold` outside the
Salon UI is `cartograph/serve.js:1918,1944,1951` — **the GET/POST endpoint that stores it.**
**No baker, no index builder, no runtime reads it.** It is a dial wired to its own
save-file.
▶ `grep -rn "groveThreshold" arborist/ cartograph/` → 3 hits, all in the persistence endpoint
▶ `node -e "console.log(require('./public/looks/lafayette-square/design.json').groveThreshold)"` → **null** (never set on LS)
- **Class:** ⛔ **ASPIRATION** — a designed perf lever, built as far as the UI + persistence
  and never connected. ⚠️ **It looks exactly like a working control**, which is why its
  purpose could only be recovered from memory. **Jacob's call whether to wire or remove.**

### ⛔ AND THE DIAL IS MEASURING THE WRONG THING — the pine example is the proof
Jacob: *"if there are 30 pine species we might include them all because the barks and
leaves would still be very limited."* ⭐ **Correct, and the atlas already behaves that way.**
**Measured on LS: 13 roster entries → 9 atlas tiles total (4 bark + 5 leaf).**
▶ `node -e "const j=require('./public/baked/lafayette-square/trees-atlas.json');const b={};for(const t of j.tiles)b[t.classification]=(b[t.classification]||0)+1;console.log(b,'rosterSize',j.rosterSize)"`

`bake-look.js#unifyAtlases` sha1-dedupes tiles across the roster (`ARCHITECTURE §The
Grove's single master atlas`: *"adding hero species costs nearly nothing in atlas
footprint"*). ⇒ **Atlas cost scales with DISTINCT PARTS, not with species count.**
**A top-N-by-census-count bar is therefore the wrong dial for the cost it claims to
control** — 30 pines sharing one bark and one needle pack cost ~1 bark + 1 leaf tile.
⭐ **What the bar should cut, if anything, is GEOMETRY count (GLB weight — F-25's 85–88%
of slab payload), not atlas inclusion.** ⛔ Naming this, not deciding it.

## F-24 · **THE LEFT COLUMN — what it actually is, against Jacob's description**
| Jacob's reading | measured |
|---|---|
| "holds *all* our tree specimens" | ⛔ **No — it is the DEMAND side.** It lists the neighbourhood's **roster species** (84 canonical names for LS) from `GET /coverage`. Our *specimens* are the Shelves (241 chassis) and the pool. **Supply and demand are different columns on different surfaces.** |
| "select a neighborhood → sorts requested trees up top, in order of request volume" | ✅ **Yes, and it is per-neighbourhood.** `roster-coverage.js:249` sorts `b.count - a.count`; the store scopes it by `?look=` → scene. |
| "sub-sorted by level of completeness" | ⛔ **No.** The sub-sort is **alphabetical** (`|| a.species.localeCompare(b.species)`). And per **F-20 it could not do otherwise — completeness is not modelled.** ⭐ **This is the single highest-value line in Jacob's description and it is the one thing missing.** |

---

## §2 — THE SPINE HAS LANDED · what it obsoletes elsewhere (phase-2 prune list)

`arborist/ORIENTATION.md` rewritten 2026-08-23 — **Wren**. Prior version archived to
`arborist/_archive/ORIENTATION-2026-08-23-pre-exorcism.md`.

⭐ **Net-down is NOT yet realised** — the spine absorbed material that does not exist
anywhere else (§2 the join · §4 the artifact map · §6 authored-vs-derived · the states).
**The corpus shrinks when the passages below are excised, and that is phase 2.**

| doc | excise | why |
|---|---|---|
| `README.md` | its `⭐ START HERE`, its read-order, the Grove→Slab troubleshooting block, `--look` in the CLI table | third front door (F-07/§I-32); F-03; F-02 |
| `FEATURES.md` | the Procedural / LiDAR / Scan knob tables + endpoints; the `park_*` paths; `--look`; the Grove "Re-publish" instruction | R-2; F-10; F-02 |
| `ARCHITECTURE.md` | §Configuration D's all-mesh sentence; the duplicated GPU-gauge para; the AS-BUILT "Gap 2 is open" block; §Monopodial; the SCA/procedural sections | F-04; F-08; F-03; F-18; R-2 |
| `NOTES.md` | the 2026-06-25 (EOD) ALL-MESH bullet | F-04 |
| `BACKLOG.md` | *"the diorama looking worse … is the system WORKING"* | **R-1 — Jacob does not accept it** |
| `SPEC.md` · `STAGE0-KEYSTONE.md` · `LIBRARY-BUILDER.md` | ⛔ **pending Jacob — F-07** | the old ORIENTATION called them archived; they are live |

**Owed before phase 2 starts:** Jacob's rulings on **F-07** (are those three docs archived?)
and **F-13** (botanical twins — ROT or the intended namespace?). Everything else in this
ledger is either measured-and-classified or already ruled on (R-1, R-2, R-3).

---

## §3 — CALLS WREN SHOULD HAVE MADE, MADE *(Jacob, 2026-08-23: "We're back to this
## question again. I don't know what the question is.")*
⛔ **Both were answerable by reading. Asking was outsourcing comprehension (`CLAUDE.md`).**

### D-1 · `SPEC.md` · `STAGE0-KEYSTONE.md` · `LIBRARY-BUILDER.md` · `ROSTER-COVERAGE.md`
   → **ROT. ARCHIVE ALL FOUR.** *(no ruling required — each says so itself)*
- **`SPEC.md` line 3, verbatim:** *"⚠️ **SUPERSEDED** — this is the 2026-04-27 v1 work order
  (LiDAR/QSM)."* It is a **work order for the LiDAR pipeline**, its build section is
  *"Pipeline (Python)"*, and it survives on the plea that *"LiDAR is now a kept PEER
  track."* ⛔ **R-2 kills that plea.** It documents 4 endpoints — it was never the contract
  `serve.js:5` claims it is.
- **`STAGE0-KEYSTONE.md` line 3:** *"⚠️ SUPERSEDED 2026-06 — frozen Stage-0 snapshot."*
- **`LIBRARY-BUILDER.md` line 3:** *"⚠️ SUPERSEDED 2026-06 — frozen Stage-0 declaration…
  not the as-built inventory."*
- **`ROSTER-COVERAGE.md`** calls itself a LIVING DOC but is a **hand-maintained 2026-05-25
  snapshot** of exactly what `GET /coverage` now computes live — and it is keyed to the
  dead `src/data/park_trees.json` (F-10). ⛔ `CLAUDE.md`: *"if it can be checked by running
  something, it is a check, not prose."* **Replaced by the command, not by another doc.**
- **Action:** all four → `arborist/_archive/<name>-2026-08-23.md`; repoint `serve.js:5`'s
  SPEC citation at `ORIENTATION.md §5`. ⭐ **This is the net-down: 4 docs, ~930 lines.**

### D-2 · The botanical twins → **ROT, but MERGE before retiring**
**Jacob settled this by naming the operator** (2026-08-23): *"chassises, barks and leaves
(+ seasons), native and suggested groupings. **A non-botanist human is the operator.**"*
⇒ **`acer_saccharum` is not a name the operator uses.** Latin slugs are **supply-side
metadata**, never operator-facing identity. The operator-facing key is the **roster/common
name** (`Sugar Maple` → `maple_sugar`). **The twins are rot.**
⛔ **But `acer_saccharum` holds a real composition (2026-07-10) that routes nowhere (F-13).**
**Action is MERGE-then-retire, never delete:** carry its authored recipe onto `maple_sugar`
(if newer), then archive the botanical dirs. **Same for `quercus_alba`, `tilia_americana`,
`nyssa_sylvatica`, `betula_pendula`.**
⚠️ **And the dossiers are ALL botanical-named** (`acer_saccharum.json`, …) while every
shipping tree is roster-named — **the mixer's demand side and supply side are keyed
differently (F-19).** The dossier is the species' *declaration*, so it must be reachable
from the operator's name. **Phase 2: one key, and it is the operator's.**

## ⭐⭐ F-25 · **SEASONS ARE AUTHORED AND NOTHING RENDERS THEM** · **ASPIRATION, OWED**
*(Jacob names "+ seasons" as part of the product, 2026-08-23.)*
- **The vocabulary is real:** `rubric.json` axis **`leaf.season`** — a day-of-year *curve*
  with anchors `buds · spring · summer · fall · winter`.
- ⭐ **And it is AUTHORED, per species, with real values.** Every dossier carries a
  five-anchor colour ramp — e.g. `quercus_palustris` summer `#2e6b33` → fall `#9e2b25`;
  `taxodium_distichum` carries `winter: null` with the note *"DECIDUOUS conifer — has a
  bare-winter anchor, unlike an evergreen conifer."* **That is careful botanical authoring.**
  ▶ `grep -h '"leaf.season"' arborist/dossiers/*.json | wc -l`
- ⛔ **No renderer reads it.** `treeAtlasMaterial.js` has no season path, no `uDayOfYear`.
  ▶ `grep -c "season\|uDayOfYear" src/components/treeAtlasMaterial.js` → 0
- ⛔⛔ **And its stated home is a RETIRED design.** The axis's own `home` field points at
  *"ARCHITECTURE.md §Phase F Layer 2, annualCycle"* — the section `ARCHITECTURE` itself
  heads **"⛔ NOT the live model (design retired 2026-06)."** ⭐ **So the authored data
  points at a design that was killed, and the killing left the data orphaned rather than
  re-homed.** Textbook ASPIRATION: intent built halfway, filed as done.
- **Owed:** a live home for seasonal colour. The retired design was a per-anchor gradient
  LUT keyed on `uDayOfYear`; the live doctrine is **posterize recolour** on a rubric axis.
  **The anchors survive either way — they are colours, not a mechanism.**

## F-26 · ⚠️ **"NATIVE" ALREADY MEANS SOMETHING ELSE — a word collision to settle**
In the code today **`native` means "the leaf this SPECIES actually has"** — the dossier's
`leaf.silhouette` / `leaf.ways` target, surfaced in the Salon's leaf-source vocabulary
(`Bare · Native · Synthetic`, `SalonWorkstage.jsx:968-972,1129`).
⛔ **There is NO region-native concept anywhere** — nothing marks a species as native to
St. Louis, or to town #2. So *"native groupings"* is either (a) the existing leaf-source
sense, which exists, or (b) regional provenance, which is **unbuilt**.
⭐ **Flagging the collision rather than guessing:** if grouping by regional nativeness is
wanted, it needs a different word, because `Native` is already on screen meaning something
else. *(Related: `suggested` — the retired "Recommended" framing (F-06) used to be the
suggestion mechanism; the habit **shelves** are its replacement and they are empty (F-19).)*
