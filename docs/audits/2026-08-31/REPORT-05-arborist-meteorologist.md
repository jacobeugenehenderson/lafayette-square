# REPORT 05 — Arborist + Meteorologist

Branch `land-use-derivation`, HEAD `5a0bdaea`, 2026-08-31. **Zero edits made**
(`git status --porcelain` clean).

---

## EXECUTIVE SUMMARY — four headlines

**1 · The operator's authoring is not under version control; 884 MB of regenerable JPEGs are.**
All 13 `arborist/state/*/compositions.json` — the authored recipes, ~4 KB total, what Layer 0 calls
*the product* — are excluded by `.gitignore:225` under a comment calling them *"regenerable."*
**They are not.**

```bash
git check-ignore -v arborist/state/maple_sugar/compositions.json   # → .gitignore:225
git ls-files arborist/state                                        # → 9 files, no compositions.json
```

README lists them under **Inputs (Authored track)**; `ORIENTATION §7` says *"composition IS
promotion."* **The cost is already concrete: two docs disagree about whether `acer_saccharum` holds
a composition and git cannot adjudicate.** Verdict **REGRESSION**. The `!` exception pattern is
already on the next line for `botanical-priors.json`.

**2 · The tree shader is at 16/16 vertex attributes, headroom zero, no guard.**
3 built-ins + 4 `instanceMatrix` + 8 from `injectFoliageSway` (`treeAtlasMaterial.js:505-509,520,
526-527`) + `aGroundRaw` (`terrainShader.js:354`). The receipt is a scar at
`treeAtlasMaterial.js:687-694`: **a 10th attribute shipped once, failed the link, every tree
vanished.** `grep -rn "MAX_VERTEX_ATTRIBS\|getProgramParameter\|VALIDATE_STATUS" src scratch
scripts cartograph` returns **only prose comments**. **The ceiling is enforced by commentary; the
failure is a silent GPU link error.** Pure Layer 0 question 2, and ~10 lines to fix.

**3 · A landed spec advertises itself as pending.** `PROPOSAL-rubric-axes.md:3-4` says *"Not yet
executed: `arborist/rubric.json` is unchanged."* **`rubric.json` now carries all 36 proposed axes
exactly** — `leaf.type/shape/margin/arrangement/growthway/length/width`, `bark.texture`,
`bark.plate_outline`, and all six of §3's new axes. Doc froze 2026-08-24; rubric moved 2026-08-28
(`c3ec2203`). **ROT** — but archive rather than delete: it is the only written home of the
`leaf.growthway` vs `leaf.arrangement` ruling.

**4 · The brief's meteorologist premise is false, and that is the finding.** "14 docs / 590 lines"
is not an inversion: `meteorologist/*.js` is a **dev-only** authoring backend (`serve.js:27` port
3335, proxied in dev only, `vite.config.js:183`). The weather **runtime** is ~9,900 lines in `src/`,
mounted unconditionally at `Scene.jsx:990-996`, outside every conditional. **Real and shipped.**
Exactly one piece is default-off — `<Atmosphere/>`, gated by `skyMode:'cheap'`
(`src/instances/lafayette-square.js:15`) — and four docs say so correctly.

⭐ **On licensing, the project knows how and doesn't.** `photos-wikimedia/attribution.json`: 452
entries, **0 tracked images without one**, full artist/license/source_url. `arborist/dossiers/`:
**36/36** image records carry `licence`, and `SalonWorkstage.jsx:78-79` encodes a citation-only
restriction as a render state. Against that: **0 of 266 shipped tree parts carry any licence, credit
or vendor field.**

---

## §1 · Doc inventory

**`arborist/` — 7 active, 2,599 lines** (`_archive/` = 16 docs, 6,266 lines, **correctly used** —
every file dated and self-declared superseded; KEEP as-is).

| doc | ln | touch | KIND | disposition |
|---|---|---|---|---|
| `ORIENTATION.md` | 322 | 08-29 | **CANON — best in folder**; DONE/OWED/ABANDONED honest | KEEP (canonical entry) |
| `README.md` | 120 | 08-23 | CANON + internal contradiction (C-02) | KEEP, fix |
| `ARCHITECTURE.md` | 571 | 08-29 | CANON; 20 lines retired language inline | KEEP, prune |
| `FEATURES.md` | 403 | 08-29 | CANON + OVERLAP-with-README (C-15) | KEEP; also carrying OPERATIONS' job |
| `BACKLOG.md` | 741 | 08-29 | OVERLAP + DIARY drift (8 `[x]`, 19 ✅ vs 18 open) | KEEP, net down |
| `NOTES.md` | 243 | 08-26 | **DIARY, correctly scoped** — already cooled its May arc | KEEP — the model |
| `LEDGER-exorcism-wren.md` | 199 | 08-24 | **CANON — the domain's live coherence ledger** | KEEP; violating own rule (C-09) |

**`meteorologist/` — 14 docs, 3,616 lines.** CANON: `ARCHITECTURE.md` (266, best in suite, carries
dated self-corrections), `WEATHER-MODEL.md` (102), `CANON.md` (88, 52/9-disabled verified by
execution). PARTIAL: `README.md` (207), `FEATURES.md` (277), `OPERATIONS.md` (85), `INTERFACE.md`
(360), `STATUS.md` (93). **ARCHIVE:** `SPEC.md` (293 — unbannered ROT) and `STAGE_MIGRATION.md`
(120 — self-labeled "Historical… stale"). **ASPIRATION, correctly labeled → KEEP:** `TUNER.md` (264,
`:3` *"DESIGN COMPLETE · BUILD NOT STARTED · ⏸ TABLED"*), `CLOUD-PHASE0.md` (171). `BACKLOG.md`
(333) aspirational by design; `NOTES.md` (957) diary.

⭐ **435 lines of pure design that say "unbuilt" on line 3 is NOT the failure mode `CLAUDE.md` warns
about — it is aspiration handled correctly.**

**Domain root — 12 docs, 3,706 lines.** KEEP: `TREE-INTAKE.md` (162, explicitly per-town/Tier ①,
kit-shaped), `HANDOFF-tree-render-2026-08-28.md` (113, live — and the only home of two sized work
items), `TRAIT-SURVEY-FINDINGS.md` (1,361, honest research output; MERGE to `_archive` once cited).
ARCHIVE: `PROPOSAL-rubric-axes.md` (189, landed). `SALON-INTERFACE.md` (185) says *"in flight,
2026-06-25"* on a doc touched 2026-08-28 and names a non-trunk branch. `HIPOINTE-DEMUN-ROSTER.md`
(501) is ROT-by-own-admission and honest about it.

⛔ **17 `BRIEF-*.md` at repo root, 6 arborist-domain, and `grep -niE
"STATUS|OUTCOME|✅ LANDED|SUPERSEDED" BRIEF-arborist-*.md` returns zero.** No brief carries a
completion state, so every one reads as live work to the next agent scanning root. **A brief should
die into its output, or name the output it died into.**

---

## §2 · Coherence ledger — 19 evidenced disagreements

### Arborist

- **C-01 ROT** — landed spec says pending (headline 3).
- **C-02 ROT (doc-internal)** — `README.md:11-12` *"Procedural and LiDAR are RETIRED… not 'kept peer
  tracks'"*; ten lines later, *"Legacy peer-track routes… remain for LiDAR/Procedural."* **Two
  claims in the contract.**
- **C-03 ASPIRATION (ruled, never built)** — `ArboristApp.jsx:38-39` still statically imports
  `ProceduralWorkstage`/`LidarWorkstage`; `:75-79` routes `?legacy=`. Measured **10,344 lines**
  across the 11 named files; `serve.js` is **1,968** lines with LiDAR/procedural routes at
  `:389-861` + `:1795-1958`. ⚠️ The ledger says *"~715 of 1,833"* — **its own number has drifted.**
  **Largest open item in the domain.**
- **C-04 REGRESSION, OPEN** — `roster-coverage.js:67` has a private `parkTreesForScene`;
  `tree-bake-inputs.mjs:77` exports the real four-well `treeBakeInputsForScene` (`:112-116`), not
  imported. Ledger cites `:50` — rotted.
- **C-05 REGRESSION, OPEN** — `roster-coverage.js:189-190`: `libExists = published.has(id) ||
  chassisCount>0 || compositions.has(id)`. A `published` set now exists (`:154-156`) and is reported
  (`:258`,`:295`) — **the disclosure landed, the predicate still ORs.** Layer 0 q2 inside an
  instrument.
- **C-06 ROT, OPEN** — `Grove.jsx:1276-1278` still wires
  `qualityOverride`/`categoryOverride`/`operatorNotes` for a ladder retired 2026-07-08. Data:
  `0 0 0 of 37` variants.
- **C-07 ROT, OPEN** — `tree-bake-inputs.mjs:119-120` promises *"absent → bake-trees falls back to
  LS's global map."* **That map does not exist.** ⛔ **A comment describing a fallback is what
  teaches the next agent to rebuild one.**
- **C-08 OPEN + doc conflict** — `bake-look.js:1490`/`:1515` still emit
  `impostorBySpecies`/`opaqueBySpecies`; read path `InstancedTrees.jsx:698` unreachable because
  `bake-trees.js:320` `PROM_THRESHOLD: 0`. ⭐ But `ARCHITECTURE.md:401` says that constant is *"the
  LEGACY bake-time classifier; the live split is at…"* — **two live docs, two accounts of one
  constant. Which is right: not measured, cause not established.**
- **C-09 ROT (process)** — the ledger's own `:6` says *"Delete an item when it is done — do not mark
  it done."* A8 occupies ~40 lines headed *"✅ RESOLVED"*; A6/A6b marked "Fixed" and kept. I verified
  A6 **is** genuinely fixed (`TreeDiorama.jsx:336` sets `treeBarkTierUniform.value = 2`). Archive
  A8's doctrine (`design.json` ≠ `scene.json`) — don't delete it.
- **C-10 ASPIRATION** — `arborist/OPERATIONS.md` **has never existed** (`ORIENTATION.md:271`,
  `:322`). ⭐ Correctly surfaced, not deleted. **Needs Jacob: owed or abandoned?** ⚠️
  `meteorologist/OPERATIONS.md` **does** exist — the register split is real in one helper, absent in
  the other.
- **C-11 ROT (dead pointer)** — `ORIENTATION.md:285` says the monopodial algorithm is *"fully specced
  in ARCHITECTURE.md"*; `LEDGER:150` records §Monopodial as **excised** 2026-08-23.
- **C-12 ROT, unadjudicable** — `LEDGER §D2` claims `acer_saccharum` holds a composition;
  `ls arborist/state/acer_saccharum/` → only `botanical-priors.json`, `seedlings.json`. Meanwhile
  `BACKLOG.md:40` calls it raw, but its manifest now has a `bark` block so `isComposedSpecies`
  returns **true**. **Two docs stale in opposite directions, and git cannot settle it because of
  §4.1.**
- **C-13 REGRESSION** — `ARCHITECTURE.md:376` calls the `atlasKind` gate *"clean."* The plumbing is;
  the classifier is not (§3.5). **An understating doc over a live bug.**
- **C-14 ROT** — `SALON-INTERFACE.md:1,3`: its own stated migration rule unrun for 9 weeks. Which
  cuts landed: **not measured.**
- **C-15 OVERLAP** — endpoint table exists twice: README 8 rows, `FEATURES.md:308` 27 rows. **A
  partial copy of a contract with no forcing function.**

### Meteorologist

- **M-01 ROT** — `README.md:63` lists as Done *"CloudDome retirement + production swap to
  `<Atmosphere/>`"*; `CloudDome.jsx` is 207 lines and **is the default** at `Scene.jsx:996`.
  `README.md:5`'s banner corrects it — **banner beside the false sentence, the exact anti-pattern.**
- **M-02 ROT ⭐** — *"13 params total"* at `FEATURES.md:87`, `:25`, `OPERATIONS.md:42`,
  `STATUS.md:25`, `CANON.md:72`, `INTERFACE.md:148` and `:221` (where it feeds an arithmetic
  estimate). Code: `cloudParamFields.js:17-30` = **12**; `:12-14` *"Removed `drift` 2026-05-20."*
  **One number, six docs, wrong in all six** — PRUNE rule 1 exactly.
- **M-03 ROT** — `FEATURES.md:39-46` describes two tabs; `MeteorologistApp.jsx:71-73` renders
  **three**. `OPERATIONS.md:30` is right — **the docs disagree with each other.**
- **M-04 ROT** — `FEATURES.md:33` publishes `selectDirective(weather, almanac, presets, override)`;
  `almanac-eval.js:40` is a destructured object with six keys. **The developer register publishes a
  broken API.**
- **M-05 ROT** — `OPERATIONS.md:60,74` say the canary is *"not yet"* wired;
  `CanaryScene.jsx:128,147,269,299-340` wire it, and `STATUS.md` marks all four links ✅ since
  2026-06-08.
- **M-06 ROT** — `ARCHITECTURE.md:161` + `STATUS.md` cite `Scene.jsx:814 / CartographApp.jsx:1083 /
  PreviewApp.jsx:1124`; actual `:996 / :1243 / :1196`. **Claim correct, coordinates rotted → should
  be a grep.**
- **M-07 ASPIRATION** — `INTERFACE.md:227-238` Cloud Chamber slot; `SlotTabs.jsx:24` renders
  Browse/Ground. `README.md:41` already rules *"reconcile the code to the doc."* **Surface as work.**
- **M-08 ASPIRATION** — `WeatherEffects.jsx:78,93` consume `directive.lightning?.rate`; **zero hits
  in `directive.schema.json`, none in `almanac.json`. The branch can never fire in production.**
  Sub-finding: `OPERATIONS.md:76` overstates — `CanaryScene.jsx:282-295` *does* synthesize lightning.
- **M-09 ROT** — `STATUS.md` lists `fixtures/` as "not populated"; `public/clouds/fixtures/` **does
  not exist**.
- **M-10 ROT, unbannered** — `SPEC.md:5` *"renders volumetric raymarched clouds"* — true only under
  `?sky=volumetric`, and unlike README/ARCHITECTURE/STATUS it carries **no banner**. **The one doc a
  cold reader would believe and be wrong.**

---

## §3 · The five standing claims

**3.1 · 16-attribute ceiling — TRUE, headroom 0.** Two live design constraints are pinned to it:
`setWhipRadius` rides `userData` (`InstancedTrees.jsx:403-406`) and the leaf-underside test uses
`gl_FrontFacing` **because it costs no attribute** (`treeAtlasMaterial.js:978-981`).

**3.2 · `y:0` sentinel + shader lift — TRUE on all three, and it is the kit-shaped implementation.**
Lift at `terrainShader.js:345` (`transformed.y += aGroundRaw * uExag / max(_instYScale, 0.0001)`).
Matrices deliberately flat (`InstancedTrees.jsx:242,457`; `HeroImpostorTrees.jsx:221`). Exag
genuinely a per-frame tween: `V_EXAG=1.5` (`terrainCommon.js:18`), uniform `terrainExag`
(`terrainShader.js:105,118`), smoothstep-eased by `TerrainExagDriver` (`BakedGround.jsx:395-415`,
mutates at `:410`); CPU baking is 52 m adrift in Browse (`elevation.js:46-58`). Sentinel read
`elevation.js:63`, documented `:28-34`, with an explicit "ASSUMPTION, UNTESTABLE TODAY" at `:61`.

⭐⭐ **And it is detected loudly:** `slabYIsUnstamped` (`:69-73`) → named warning at
`InstancedTrees.jsx:678-682`, **no LS constant, no species list, so it works in town #2**, and it
self-silences when bakes start stamping. **This is the standard the rest of the domain should be
measured against.**

⚠️ Gap: `elevation.js:64` and `InstancedTrees.jsx:297` are **per-instance silent** fallbacks — the
bulk cases are loud (`:664-671`), but a partially-stamped slab degrades one tree at a time,
uncovered.

**3.3 · Two library ids / uncomposed fallback — ⚠️ STALE, it was FIXED.** `preferComposedTwin` at
`bake-trees.js:247`, called at `:277` and `:294`; `isComposedSpecies` at `:223-232`. Commits
`a56328dd`, `deab54ed`. ⭐ **Keyed on `resolveSpecies` canonical — no pair list, no skip list, so it
is a class fix.** The comment at `:198-221` explicitly rejects blanket "prefer composed" as the
worse bug.

**Two residual silent spots:** (1) `:230` `} catch { composed = false }` — an unreadable manifest
silently degrades to old behaviour, and **this is the only quiet catch in a file that warns loudly
at `:667,:770,:1119,:1125`**; (2) no log at all when no composed sibling exists. ⭐ **(2) is a
documented decision, not a bug — don't change the behaviour, add a count.**

**3.4 · Both OPEN items still open.**

**C1:** slab `trees-atlas.json` (generated 2026-08-29) gives
`heroImpostorBySpecies.acer_saccharum.canopyRadiusM = 60.0356` (vs `maple_sugar` 11.10,
`maple_silver` 8.71). `impostorGeometry.js:350,353,355`: **`2 × (60.0356 + 1.5) = 123.07 m`** — the
123 m card to the centimetre. Its own dossier authors `canopyRadiusM: 9` — **6.7×**, consistent with
a merged group shot, because `tree-bounds.js:66-76` **averages spans over the whole document**.
`split-group-shots.js` exists (510 lines) but `grep -rn "split-group-shots"` finds **no caller in
any pipeline** — nothing re-runs it, and 251 placements ship the 60 m radius. ⚠️ `HANDOFF:73` says
"65 × 106 m" → 42.75, which **does not reconcile with 60.0356**; **cause not established.**
⭐ The prize is a check comparing measured bounds to the dossier's authored radius — **catches every
group-shot GLB at intake.**

**C2:** `impostorGeometry.js:364` `const N = Math.max(2, Math.round(opts.grid ?? 20))`. **No caller
passes `grid`** — `HeroImpostorTrees.jsx:176` and `SpecimenViewport.jsx:1205` both omit it. Front
shell, under shell and bark all get 20×20. ⚠️ The 11.68M→3.97M figures are **projections in
`HANDOFF:75-77`, not measurements.**

⛔ **Neither C1 nor C2 is in `arborist/BACKLOG.md`** — two sized work items invisible to the doc that
lists live work. The memory's "`ROADMAP B7`" resolves only through that handoff's parenthetical; **no
`ROADMAP` section carries B7.**

**3.5 · `atlasKind` `/stem/` — STILL PRESENT, and worse than recorded.**
`atlas-kind-classifier.js:52-55`, four unanchored regexes. Confirmed false positive:
`Acer_saccharum_multistem_001` → **WOOD for every primitive, foliage included.** `/caps?/` catches
`Landscape`, `capsule`, `escape`; `/wood/` catches `Redwood`, `Basswood`, `Dogwood`.

**Three further defects, none recorded anywhere:** `/branch/` → WOOD at `:53` but LEAF at `:54`;
⭐⭐ `:53` matches *ancestor node names* and **the root node carries the SPECIES name, not a part
name** — **that is the real class, `multistem` is one instance**; `needle` absent from LEAF sets so
conifers fall to AMBIGUOUS. Fall-through silent by design (`:120`). Per `ARCHITECTURE.md:369-376`
this gates the bark-retint and wind shaders, so **a mis-stamp gets the wrong shader path and looks
plausible.**

---

## §4 · Asset weight — 2.0 GB tracked

`git ls-files -z | xargs -0 du -ch | tail -1` → **2.0 G**

| dir | tracked | size | on disk | status |
|---|---|---|---|---|
| `photos-wikimedia/` | 298 | **884 M** | 884 M | SOURCE, tracked — **44% of clone** |
| `public/baked/` | 1,077 img/glb | **516 M** | — | BAKED, tracked **deliberately** |
| `public/textures/` | 81 | 91 M | — | SOURCE |
| `assets/` | 14 | 16 M | 1.5 G | mixed |
| `inventory/` | 27 | 2.0 M | 2.0 M | SOURCE |
| `arborist/` | 153 | 3.2 M | **2.0 G** | code+JSON; 2 G is ignored cache |
| `meteorologist/` | 29 | 488 K | 3.2 M | code+docs |
| `botanica/` | **0** | — | **103 G** | ignored `:214` |
| `models/` | **0** | — | 2.3 G | ignored `:45` |
| `public/trees/` | **0** | — | 5.1 G | ignored `:235` |

⭐⭐ **Most of this is a DECISION, not a defect, and `.gitignore` carries its own reasoning inline.**
`:280-288` — lod0 unpublished, *"56% of a town's payload the map never requests… at 100 towns that is
20 GB no visitor fetches."* `:289-293` — ⛔ *"KTX2 pages ARE COMMITTED — do not re-ignore them… an
ignored page is a 404 in the canopy, not a rebuild."* **That is why `public/baked` is tracked and it
is correct. ⛔ Do not propose untracking it.**

**4.1** — headline 1. The asymmetry states it: **the repo commits 884 MB re-downloadable from a
recorded URL and ignores 4 KB recoverable from nowhere.**

**4.2 `photos-wikimedia` is genuinely SOURCE but nothing reads it.** `grep -rn "photos-wikimedia"`
finds only doc mentions and a **dangling symlink** `public/photos/lafayette-square/other →
../../../photos-wikimedia/other` that **breaks `npm run build`** at vite's publicDir copy — open at
`BACKLOG.md:731` **since 2026-05-25, three months.** ⭐ `NEIGHBORHOOD-INPUTS.md:136` already
classifies it Tier ③, *"sparse-to-absent for a new town"* — **a 100-town kit cannot carry one town's
884 MB in the trunk**, but that is a design change and Jacob's call.

**4.3 Dead weight (~4.6 MB):** `inventory/IGNORE/` — **19 tracked `.xlsx`** in a directory named
IGNORE, versioned by filename (`_v4_definitive`, `… copy.xlsx`), superseded by the 7 real CSV/MD
outputs. `assets/~ai-697d6064-…_.tmp` — a 508 KB Illustrator temp file, tracked. `assets/vestigial/`
— 6 files, ~2.1 MB, **the name is the verdict.**

**4.4** `botanica/` (103 GB) feeds the track Jacob ruled dead 2026-08-23. Off-repo so it costs no
clone, but it is named in the removal scope and its zenodo provenance is recorded, so deleting it is
safe and reversible.

**4.5 ⛔ Live cross-helper defect, recorded only in `.gitignore:280-288`:** the Meteorologist canary
resolves **lod0**, which is not published — **it will 404 on a deployed site.** In no BACKLOG.

---

## §5 · Licensing — what exists, what is missing

**Exemplary (2):** `photos-wikimedia/attribution.json` — 452 entries, **0 tracked images
uncovered**, licenses CC BY-SA 2.0 ×427 / "No restrictions" ×8 / BY-SA 4.0 ×6 / BY-SA 3.0 ×4 / PD ×3
/ BY 2.0 ×3 / BY 3.0 ×1, 17 artists. `arborist/dossiers/` — **36/36** image records carry `licence` +
`credit`, rendered at `SalonWorkstage.jsx:98,115`, with `citationOnly` at `:78-79` encoding *"Licence
forbids us embedding their photographs"* as a **first-class render state.**

**Missing (3):**

1. ⛔⛔ **0 of 266 tree parts carry licence/credit/vendor.** `part-index.json`: `counts {chassis:239,
   leaf:18, bark:9}`, `sources {authored:253, procedural:13}`. `source:"authored"` is a
   pipeline-stage label. `INVENTORY.md:11-19` marks parts "🟢 vendor" naming neither vendor nor
   licence. **The only record is `BACKLOG.md:7`** — *"4 Poly Haven CC0 barks + 6 scanned vendor leaf
   packs"*. These are baked into `trees-atlas-color.png` (19.7 MB on HPDM) and **shipped to every
   visitor**; a scanned commercial leaf pack's licence commonly restricts redistributing the texture
   as a texture — which is what an atlas page is. ⛔ **I am not guessing what those licences say.
   What is establishable: the terms are not recorded anywhere.**
2. **Attribution recorded but never displayed.** `grep -rn "attribution" src/` returns only unrelated
   GPU-cost comments.
3. **No repo LICENSE and no THIRD-PARTY/NOTICE file.**

⭐ **The kit-shaped fix:** `ingest.js` already stamps `source`, `sourcePath`, `tags`,
`conformReport` per part. **Require `licence` + `credit` + `sourceUrl` and fail ingest loudly when
absent.** The dossier schema proves the shape; `SalonWorkstage.jsx:78-79` proves the UI carries it.
**That covers every future part in every future town. A spreadsheet of today's 266 delivers nothing
to town #2.**

---

## §6 · The meteorologist "inversion" — premise false

`meteorologist/serve.js` 247 (dev-only, port 3335) · `pipeline/validate.js` 150 (**ran it:
`ok: 52 presets, 16 rules, 7 modulators`** — matches `OPERATIONS.md:24`) · three one-shot
migrations, 193. Runtime: sky/celestial ~3,900 · dome/poller/atmosphere/hooks ~2,100 · precip 514 ·
authoring UI 3,407. Mounted at `Scene.jsx:990-996` outside every conditional, plus
`SkyEmbed.jsx:83-88`, `CartographApp.jsx:1243`, `PreviewApp.jsx:1196`, `CanaryScene.jsx:147`;
`App.jsx:876-877` documents Scene must stay mounted *"so the Player's Almanac has a temperature."*

**REAL AND SHIPPED.** ⚠️ `STATUS.md`'s own caveat — 2026-06-08 ✅ rows *"not yet eye-verified"* — is
12 weeks unresolved; **whether an eye-gate happened: cause not established.**

---

## §7 · Ranked, by kit value

1. ⛔⛔ **Track `compositions.json`** — 4 KB, one `!` line, and fix the false "regenerable" comment
   in the same commit (**the comment is what re-creates the rule**).
2. ⛔ **Add the attribute-ceiling assertion** — ~10 lines against `gl.getParameter(gl.MAX_VERTEX_ATTRIBS)`,
   throwing by name. **Cheapest checker here.**
3. ⭐ **Make `ingest.js` require licence/credit/sourceUrl and fail loudly.**
4. ⭐ **Add the group-shot check** — measured bounds vs dossier `canopyRadiusM`, fail past a ratio.
   **Catches the class at intake.**
5. **Fix `atlas-kind-classifier.js:52-55`** — anchor, resolve the `/branch/` contradiction, add
   `needle`, print the ambiguous count; then decide the deeper one (`:53` matches the species name).
6. **Doc triage, cheapest first** — archive `PROPOSAL-rubric-axes.md` and `meteorologist/SPEC.md`;
   excise `README.md:63` and the arborist README contradiction; replace "13 params" in six files with
   the command; give the six spent briefs an outcome line.
7. **To Jacob** — C-08 (is the killed impostor's emission removable?) and C-10
   (`arborist/OPERATIONS.md`: owed or abandoned?). **Neither is an agent's to settle.**

⛔ **What I would NOT do:** untrack `public/baked` (the KTX2 reasoning is correct; reversing it 404s
the canopy) · delete `photos-wikimedia` (licensed source) · "fix" the silent no-composed-sibling path
(**documented decision; add a count, don't change behaviour**).

---

## §8 · Scorecard

| claim | verdict |
|---|---|
| shader at 16-attribute ceiling | ✅ TRUE — 16/16, **no guard** |
| `y:0` sentinel; lift in shader | ✅ TRUE ×3 — and the kit-shaped exemplar |
| fallback picks the uncomposed twin | ⚠️ **STALE — FIXED**; two residual silent spots |
| `acer_saccharum` 123 m card | ✅ OPEN — 2×(60.0356+1.5)=123.07 exactly |
| card grid 11.7M→4.0M | ✅ OPEN — zero code; `grid` param unused |
| `atlasKind` `/stem/` bug | ✅ PRESENT — **+3 further defects** |
| *(brief)* meteorologist inversion | ❌ **FALSE** — runtime ~9,900 ln, shipped |

**Two of seven standing claims were wrong — one stale-closed, one a brief premise. Both were caught
only by reading the source.**
