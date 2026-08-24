# Arborist — Orientation

**The front door, and the only one.** What the Arborist *is*, what each surface is for,
which artifact each one reads, and what is done / owed / abandoned. Everything else in
`arborist/` is detail hanging off this page.

*Measured against the code 2026-08-23; §2 and §7 re-measured 2026-08-24. What is still owed
to make it true: `LEDGER-exorcism-wren.md`. The night-shift baton:
`BRIEF-arborist-join-and-budget.md` (repo root). Prior versions: `_archive/`.*

> ⛔ **Every number below is a COMMAND, not a figure.** A count written into prose is stale
> the day it is written and is then quoted for months (`CLAUDE.md`). Run the line.

---

## 1. What the Arborist is for

**The Arborist is a leaf-, bark- and chassis MIXER.** Its premise is that a neighbourhood
does not need a literal, hand-modelled tree for every species it contains — because a
tree's readable identity is *a silhouette, a bark and a leaf*, and we hold those as
**parts**. Ask for a species; the Arborist composes the best tree it can from the parts on
hand.

That is the whole idea, and it is the thing to measure everything against: **coverage
should come from composition, not from procurement.** Where the kit still needs a literal
model per species, the mixer has not made good.

**It does not decide where trees go or how many.** The **Cartograph** holds the census and
is the Arborist's client. The Arborist's entire output is *pristine, whole, unique tree
assets*; placing the few across the many is the Cartograph's job, and nothing downstream of
the bake may improve or repair an asset — only decide whether it is seen.

---

## 2. The two sides, and the join between them

Almost every confusion in this app comes from mistaking one of these for the other.

- **DEMAND — what a neighbourhood asks for.** A census of real trees, per town, keyed by
  roster names like `Oak, Pin`. This is the Salon's **left column**.
- **SUPPLY — what we hold.** 241 chassis, plus bark refs and leaf packs. This is the
  **Shelves**, and the pool of already-composed species.
- **THE JOIN — how a demanded species finds its parts.** Two halves, and **both are the
  open work of the whole app**:
  1. a **dossier** — the species declaring which habit / bark / leaf it needs;
  2. a **habit shelf** — each chassis ratified as one of nine habits, so a species can land
     on the right shelf and browse.

▶ `ls arborist/dossiers/*.json | wc -l` against the roster size, and
▶ `node -e "const p=require('./arborist/state/part-index.json').parts.filter(x=>x.partType==='chassis');const h=x=>x.tags?.['chassis.habit'];console.log('ratified',p.filter(x=>h(x)?.ratified).length,'| valued',p.filter(x=>h(x)?.value).length,'| of',p.length)"`

⛔ **And the habit values that exist are mostly circular.** Nearly all of them were derived
from `source.species-botany(<the chassis's own original species>)` — *"this GLB came off a
sugar maple, so it has a sugar maple's habit."* The keying doctrine rules the opposite: **a
chassis is free geometry; picking it IS the assignment, and its own `source.species` keys
nothing.** So today the mixer can confidently shelve a chassis only for species we already
had a model of — **precisely the need the mixer exists to remove.**

⇒ **When the map routes a species at a generic tree, that is not a routing bug. It is this
join being empty.** Repointing routes without filling the join is an instance patch.

⭐⭐ **AND THE JOIN'S CHEAPEST WIN IS ALREADY BUILT AND UNFED** *(measured 2026-08-24)*: the
bark **gradient-map** path — a LUT indexed by the texture's Rec.601 luminance, so structure
survives and only the palette changes, i.e. **one greyscale bark × N maps = N species**. Every
stage exists (`compileGradientLUT` → `barkGradient` atlas tile → `barkGradientByVariant` →
the shader) and **no composition has ever carried `bark.gradientStops`**, so the bark selector
does nothing and every variant falls through to the legacy single-tint path.
▶ `node -e "const a=require('./public/baked/lafayette-square/trees-atlas.json');const by={};for(const t of a.tiles)by[t.classification]=(by[t.classification]||0)+1;console.log(by,'gradient',Object.keys(a.barkGradientByVariant||{}).length)"`
⭐ Dossiers already hold the botanical description this hangs off (*"smooth grey-brown bark"*).
**Best effort, best guess, overridable** — the kit's own doctrine, and the Arborist is not
exempt from it. ⚠️ 2026-08-24: a gate requiring *ratified* parts was landed in
`readiness.js` and reverted the same day (squashed out of history) — it treated an
un-overridden best guess as invalid and flattened the readiness board to identical rows,
destroying the "what do I go get" signal. ⛔ **Do not re-land it.**

### ⭐ The operator is a NON-BOTANIST. That decides the keys.
*(Jacob, 2026-08-23.)* The operator works in **chassis · bark · leaf (+ season)** and in
**groupings**, not in Latin. ⇒ **A species' identity, everywhere the operator can see it,
is its common name** (`Sugar Maple` → `maple_sugar`). Botanical slugs are **supply-side
metadata** — provenance on a part, never a name on a surface.
⛔ **Today this is broken on both sides of the join:** several species exist twice, once
botanical and once roster-keyed (`acer_saccharum` *and* `maple_sugar`), and the **dossiers
are all botanical-named while every shipping tree is roster-named.** So the side that
*declares what a species needs* and the side that *holds what we have* are keyed in
different languages. **One key, and it is the operator's.**
⚠️ One of those twins holds a real composition that routes nowhere — so the move is
**merge, then retire**, never delete.
▶ `node -e "const m=require('./cartograph/data/lafayette-square/tree-species-map.json').map;const t=new Set(Object.values(m).flat());console.log([...t].filter(Boolean).sort().join(' '))"`

⚠️ **A word already taken: `Native`.** In the app today *native* means **the leaf this
species actually has** (the dossier's target pack/arrangement — the Salon's
`Bare · Native · Synthetic`). **There is no regional-nativeness concept anywhere.** If
grouping by region is wanted it is unbuilt **and it needs a different word.**

---

## 3. The surfaces — seven, and what each is FOR

`src/arborist/ArboristApp.jsx` is the whole router; read it, it is eight lines.
▶ `sed -n '100,107p' src/arborist/ArboristApp.jsx`

| surface | what it is FOR | reached by |
|---|---|---|
| **Salon** | Compose ONE species from parts. The only add-surface. | default |
| **Grove** | Judge the trees together, at neighbourhood scale, and ship them. | `Grove →` / `?legacy=grove` |
| **Shelves** | Curate the SUPPLY — put each chassis on its habit shelf. | `?legacy=shelves` |
| **Coverage** | Read-only have-vs-need for the neighbourhood. | a tab inside Grove |
| **Diorama** | See ONE finished tree as it actually ships, lit by the real sky. | `?view=fullmonte`, `?embed=tree` |
| ~~Procedural~~ | ⛔ **DEAD — see §7.** | `?legacy=procedural` |
| ~~LiDAR~~ / ~~Scan~~ | ⛔ **DEAD — see §7.** | `?legacy=lidar` / `?legacy=workstage` |

Two further pieces are not surfaces but must be known: **`OverheadBaker` and
`HeroImpostorBaker` are headless render-to-texture bakers that run INSIDE the Grove.** They
are browser-GPU authored and **the CLI bake cannot reproduce them** — so a re-pour or a
merge must carry their manifest keys, never re-derive them.

---

## 4. ⭐⭐ WHICH ARTIFACT EACH SURFACE READS

**The single most load-bearing fact in this document.** Its absence has cost multiple days:
when two surfaces disagree it reads as a bug, and it is usually two different files.

| surface | reads | density |
|---|---|---|
| **Salon** | a **freshly built preview** — POSTs `{chassis,bark,leaves}`, gets a per-composition GLB + atlas that exists nowhere on disk | authoring |
| **Grove — gallery** | the **authoring pool**, `/trees/<sp>/…` | **lod0** |
| **Grove — impostor bakers** | the **bake**, `baked/<look>/trees/…` | **lod1** |
| **Shelves** | the **chassis library** only, `public/trees/_chassis/` | — |
| **Coverage** | **no geometry at all** — a join over census × routing × index | — |
| **Diorama** | the **bake** | **lod0** |
| **LS runtime** | the **bake** + the impostor records | **lod1** + impostors |

▶ `grep -n "glbUrl" arborist/serve.js src/arborist/Grove.jsx src/components/TreeDiorama.jsx`

**Three consequences, all currently mistaken for defects:**
1. **The Salon will never match the diorama**, because one is a fresh build and the other
   is a frozen file. ⛔ **This does NOT mean a worse-looking diorama is correct.** It means
   the difference is *the bake*, and a thin bake is a defect in the bake — never something
   the viewer can fix.
2. **The Grove reads two artifacts at two densities inside one surface** — you judge lod0
   from the pool while the captures that ship are made from lod1 out of the bake.
3. **`public/trees/` is gitignored and never deployed** (`.gitignore:235`). It is the
   **authoring pool**. Only `public/baked/<look>/` ships.

---

## 5. The pipeline — a part to a tree on a street

```
public/trees/_chassis/*.glb      the parts: chassis
public/textures/bark/<ref>/                bark
public/textures/leaves/shapes/<pack>/      leaf packs
        │
        │  the operator composes, in the SALON — autosaves, no publish gesture
        ▼
arborist/state/<species>/compositions.json          ← AUTHORED. the recipe.
        │
        │  generate-salon.js  (composes + bakes the authored transform)
        │      └─ shells to publish-glb.js  (variants, decimation, 3 LOD tiers)
        ▼
public/trees/<species>/{skeleton-N-lod{0,1,2}.glb, tips-N.json, manifest.json}
public/trees/index.json                              ← the catalog + the shippable variants
        │
        │  bake-look.js --look <id>   reads the LOOK's roster: looks/<look>/design.json#/trees
        │      unifyAtlases — sha1-dedupes bark + leaf tiles across the roster
        ▼
public/baked/<look>/trees-atlas.json + the master PNGs
        │
        │  bake-trees.js --scene <name>   reads the NEIGHBOURHOOD's census + routing
        ▼
public/baked/<look>/trees/<species>/…                ← THE SLAB. this is what deploys.
        │
        ▼
src/components/InstancedTrees.jsx                    ← runtime: frustum, LOD selection, impostors
```

⛔ **`--look` and `--scene` are different axes and the two commands take different flags.**
`bake-look --look` packs the **Look's** atlas; `bake-trees --scene` places the
**neighbourhood's** census. `bake-trees` was renamed off `--look` in 2026-07-15 — it always
meant the scene. A Look is a *style* over a neighbourhood; a scene is the *place*.

**One gesture ships: the Grove's "Bake → Slab."** It regenerates every composed species
from source, rebuilds the index, packs the atlas, then places the census — in that order.
⛔ **There is no per-species "Re-publish" step and there has not been since 2026-06-25.**
Any doc telling you to publish before baking is stale.
▶ `sed -n '1156,1216p' arborist/serve.js`

---

## 6. Authored · derived · baked · per-operator

**AUTHORED — the operator made this. It is the product. Never "fix" it to a default.**

| what | where |
|---|---|
| the recipe for a species | `arborist/state/<species>/compositions.json` |
| which trees are in a Look (**"atlas inclusion"**) | `public/looks/<look>/design.json#/trees` |
| which library species a roster name routes to | `cartograph/data/<scene>/tree-species-map.json` |
| roster name merges | `arborist/roster-name-canon.json` |
| chassis approve / rename / notes | `arborist/state/_chassis-curation.json` |
| the species vocabulary + dossiers | `arborist/rubric.json`, `arborist/dossiers/<id>.json` |

⛔ **The census and the routing map are PER-TOWN** — `cartograph/data/<scene>/`. There is no
global `src/data/park_*.json`; that was the LS special case and it was deliberately retired
so LS goes through the same intake as every other neighbourhood.
⚠️ **The census is several WELLS, not one file** — `park_census` · `park_trees` ·
`forest_park_trees` · `osm_trees` · `derived_trees`. **A reader that opens one of them is
reading a fraction of the town.**
▶ `sed -n '110,116p' cartograph/tree-bake-inputs.mjs`

**DERIVED — regenerated from the above; never hand-edit.** `public/trees/**`,
`public/trees/index.json`, `arborist/state/part-index.json`, `public/library/**`.

**BAKED — the frozen artifact; the only thing that deploys.** `public/baked/<look>/**`.
Invalidated by any authored change; refreshed only by the Grove bake.

**PER-OPERATOR — this machine, this browser. Never authored, never deployed.** The
Meteorologist canary (`localStorage`, key `meteorologist-canary-tree`, read via
`src/lib/canaryTree.js` by both the Meteorologist and the diorama) and UI open-flags.

---

## 7. What is DONE · OWED · ABANDONED

### DONE and real
The publish→bake→slab spine, deterministic and byte-verified. The single master atlas with
sha1 tile dedupe — **atlas cost scales with distinct PARTS, not species count**, so a dozen
pines sharing one bark and one needle pack are nearly free.
▶ `node -e "const j=require('./public/baked/lafayette-square/trees-atlas.json');const b={};for(const t of j.tiles)b[t.classification]=(b[t.classification]||0)+1;console.log(b,'rosterSize',j.rosterSize)"`
The **geometry budget** (2026-08-24): who keeps mesh in the hero shot is decided at BAKE by
distance to the authored camera path, spending a **triangle** budget — not a tree count, not
trunk diameter, which predicts neither cost nor visibility (`arborist/hero-band.mjs`;
`role-at-bake` preserved, so no pop). And the runtime now says out loud when a placement kept
mesh **because its species has no baked impostor** rather than because it earned it.
▶ `node -e "const t=require('./public/baked/lafayette-square/trees.json');console.log(t.heroBandMeta)"`
The **impostor foundation**: every placement paints as a captured canopy billboard and the
tallest fraction keeps real `lod1` mesh as anchors (`?heroGeom=`); two capture systems split
by viewing hemisphere, overhead for browse and azimuthal bands for the side-on pan, both RTT
captures of the real tree. The Look roster and the slab agree exactly. Botanical mature
heights ship. The NO-FILLER gate keeps generic and procedural assets out of the runtime pool.

### OWED
- ⭐ **The join (§2)** — dossiers, and a ratified habit per chassis. **This is the app's
  real backlog; everything else is downstream of it.**
- ⭐ **A completeness state.** The kit models `composed` / `not-available` / `unauthored`,
  where **`composed` means only that a chassis is set** (`roster-coverage.js:220`) — measured
  2026-08-24, **0 of 14 species have chassis AND bark AND leaf actually chosen**; `maple_sugar`,
  the canary, has no authored bark. ⭐ **Jacob's ruling: NO promotion button — composition IS
  promotion.** *"If a tree has a chassis, leaf and bark selected it's done."* Defaults silently supply the rest,
  so **an untouched species and a finished one look identical on every surface** — you
  cannot see what you have not done. The resolver already computes whether each field was
  **authored** or **defaulted** and discards it; keeping that one fact yields *complete /
  started / not started* everywhere, and gives the manifest its missing leaf provenance.
- **The Grove invariant** *(Jacob, 2026-08-23)*: **a tree in the Grove should already be
  baked and ready for the slab.** Today the Grove is a pre-bake surface, gates on *"has a
  composition,"* and so **hides a species that ships**. Moving the gate to *"is in the
  slab"* also decides where the bake gesture lives and where the impostor bakers run.
- ⭐ **SEASONS — authored, and rendered by nothing.** `rubric.json`'s `leaf.season` is a
  day-of-year curve (`buds · spring · summer · fall · winter`), and **every dossier already
  carries real anchor colours** — bald cypress even carries `winter: null` with the note
  *"DECIDUOUS conifer — has a bare-winter anchor, unlike an evergreen conifer."* **No
  renderer reads any of it**, and the axis's own `home` field points at a design
  `ARCHITECTURE` marks retired. **The colours survive whatever replaces the mechanism —
  they are data, not a design.** This needs a live home.
  ▶ `grep -h '"leaf.season"' arborist/dossiers/*.json | wc -l` · `grep -c "season\|uDayOfYear" src/components/treeAtlasMaterial.js`
- **More parts** — leaf packs and chassis. Known and accepted.
- **KTX2 for the impostor pool**, load-streaming along the pan, and a real height (not
  `dbh`) driving the geometry split.
- **`OPERATIONS.md`** — the operator's manual. Named for months, never written; operator
  knobs still live in `FEATURES.md`.

### ABANDONED — ⛔ do not build to these, do not revive
- ⛔⛔ **PROCEDURAL and LiDAR, and the LiDAR-fed Scan workstage** *(Jacob's ruling,
  2026-08-23: "We are NOT using procedural OR LiDar so anything taking up space or confusing
  things or getting in the way or being deceptively heavy is 100% rot")*. They are **~28% of
  the app's code**, their workstages are **statically imported and therefore compiled into
  the deployed bundle**, and the LiDAR corpus in `botanica/` is enormous. Removal is phase-2
  work. Their "kept as equal peer tracks" doctrine is **void**.
- ⛔ The whole-tree octahedral cross impostor. Killed — it read as floating dark slabs.
  ⚠️ Still emitted into every slab and still read behind an unreachable condition.
- ⛔ The `annualCycle` leaf-colour design and the points-canopy ("Configuration D"). Never
  built. Leaf colour is a rubric axis recoloured by posterize.
- ⛔ The monopodial-conifer algorithm. Fully specced in `ARCHITECTURE.md`; **the file has
  never existed.**
- ⛔ The **0–4 Fill / Mid / Hero rating**, retired 2026-07-08 for **Promote / Demote**. The
  vocabulary never landed, so the retired ladder is still the Grove editor's most prominent
  control — soliciting a value **nothing has ever written**.
  ▶ `node -e "const v=require('./public/trees/index.json').variants;console.log(v.filter(x=>x.qualityOverride!=null).length,'of',v.length)"`
- ⚠️ The **left-column bar** (`groveThreshold`): a top-N-with-pins build-eligibility dial.
  Built as UI + persistence and **connected to nothing** — no baker or runtime reads it.
  It also measures the wrong cost: atlas inclusion is already near-free per species (§DONE).
  **Wire it to geometry weight or remove it — it must not stay as a control that looks live.**

---

## 8. Two rules this app keeps breaking

1. ⛔ **When a consumer dies, the control dies in the same commit.** Every cleanup pass here
   removed a consumer and left the control. That is the whole mechanism behind the flotsam.
2. ⛔ **A default is not an authorship, and a doc is not a ruling.** A default renders as a
   plausible tree; a plausible-looking success in a kit is the worst outcome there is
   (`CLAUDE.md` Layer 0). The same holds for prose: an editorial sentence in a doc is a
   claim, **including one that sounds like the operator.**

## Where to go next

`README.md` — the contract (endpoints, CLI, inputs/outputs) · `FEATURES.md` — the operator
surface · `ARCHITECTURE.md` — load-bearing patterns · `BACKLOG.md` — in flight ·
`NOTES.md` — dated decisions · `SALON-INTERFACE.md` (repo root) — the Salon's design.

**Retired 2026-08-23 to `_archive/` — history, not canon.** `SPEC.md` (the 2026-04-27 v1
LiDAR work order) · `STAGE0-KEYSTONE.md` · `LIBRARY-BUILDER.md` (frozen Stage-0 snapshots)
· `ROSTER-COVERAGE.md` (a hand-typed tracker of what `GET /coverage` now computes live).
**Each declared itself superseded in its own opening line.**

✅ **Conformed to this page on 2026-08-23** — the false claims are excised, the retired tracks are
archived, and the dead paths are repointed. ⛔ **That does not make them true forever: where one
disagrees with this page, check the CODE, not either document**, then fix whichever is wrong
(`CLAUDE.md` — the docs and the code are each other's smell detector).
⚠️ **`OPERATIONS.md` still does not exist**; operator knobs live in `FEATURES.md`.
