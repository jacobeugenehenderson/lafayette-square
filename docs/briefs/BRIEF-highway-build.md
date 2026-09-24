# BRIEF — Build the highway as the positive object (H-3)

<!-- BRIEF-STATE
status: DISPATCHED — builder Gantry, 2026-09-23
dispatched: yes (Gantry)
written: 2026-09-23
supersedes: cartograph/_archive/BRIEF-highway-positive-object-SUPERSEDED-2026-09-23.md (the design review, retired on dispatch)
evict-when: the seven checks are green on Huron and LS, and each combed question below carries its `check`
-->

**You are the dispatched agent. Name yourself — one word, yours.** **Agent: FRESH** — the brief is complete; Grader [07b5ef] (the plan's author) is available for questions via SendMessage; don't build on memory of the design session.

**What this is.** The build plan for `ROADMAP H-3`. The design was hammered in review on 2026-09-23 (agent *Grader*), and Jacob ruled on every point. **You build from this. You do not reopen it.**

- Where a step says **[U]**, no code states the value. **Build it anyway and disclose it by name.** Never replace it with a constant of your own.
- Where something here contradicts the code you open, **stop and flag Boz**. That stop is the work (`CLAUDE.md` step 2).
- **Read the brief AND the code sites, and tell Jacob what you found. If the code contradicts the brief, stop and flag.**

## Bounds

- **Nothing is off limits, but don't volunteer blast radius** (Jacob, 2026-09-23).
- ① (`mintProtopolygon`), the skeleton's welders and the divided-road machinery are **not reopened**. This build adds exactly:
  - three frame facts in `skeleton.js` (step 0);
  - one identity stamp in the mint (`gradeEnd`, step 4);
  - one resolver key: Wren's `pedRealm`, which already exists.
- If a step can't close without more than that, stop, **measure the blast radius**, and bring it to Jacob.
- **Dependencies:**
  - `A19`, Wren's *"class decides, not name"* work — ✅ **LANDED** (`9042204a`).
  - **Still a dependency — don't start until it's on the trunk:** Wren's `pedRealm:false` resolver key: `skeleton.js` · `streetProfiles.js` · `tileGround.js resolvePedDepths`. Its gate is `checks/claims-a-frontage-can-ask-for-no-ped-band.mjs`.

## The rulings you build to

They are recorded in `references/registry.json`; cite the ids, never restate them.

| | Ruling | id / home |
|---|---|---|
| model | The roadway **is** the object: an alignment swept by a typical section. **Not** ①'s negative space. | `r-highway-positive-object` |
| authoring | Highways take no authoring and no geometry access. A missing or wrong input **fails loudly**. | `r-highway-no-authoring` |
| verge | Land bounded entirely by highway is verge: grass, no curb, no sidewalk, no land-use choice. | `r-highway-verge` |
| (a) | A **two-way** `motorway`/`motorway_link` is not limited-access. Print each case by name. Two-way `trunk` **stays** highway (untested on our four towns). | H-3, 2026-09-23 |
| (b) | **One edge.** Every block is differenced against the highway polygon H. No `max()`, no second smoothing. | H-3 |
| (c) | Verge = every street-owned edge is highway, **or** is an overpass span between two highway edges. | H-3 |
| (d) | Missing lanes: draw at the stated minimum, stamp `ASSUMED`, and disclose on three surfaces (pour log, stamp, Survey marker). **Never refuse to draw.** | H-3 |
| (e) | Section values come from `references/` only: a finding, a measurement, a derivation, or **[U]**. The pour prints each value's source id. | `references/README.md` |
| (f) | The weld runs in `skeleton.js`, **after** synthetic numbering. Highway chains only; the survivor keeps its id; lanes are carried per span. | H-3 |
| (g) | JR frontage = zero **RAW** building footprints (`raw/msbf.json`), **never** the member/shown set. The pour prints, per town, how many building-less regions became JR. | H-3 |
| (h) | v1 accepts class-based draw order: a highway deck over a local street draws under it. | H-3 |
| (i) | Non-highway grade-separated chains: a pedestrian one becomes a path ribbon; a vehicular bridge keeps its own seed and is listed by name. v1 takes whatever A19 produced. | H-3 |
| JR | A JR does **not** need a highway-owned edge. The **park guard is DROPPED.** | Jacob, 2026-09-23 |
| parcels | **Ruled-to-measure, not built.** The pour prints the faces where the parcel and building tests disagree (LS 5, Huron 0 as of 2026-09-23). It does not act on them. | Jacob, 2026-09-23 |

## Every drawn value, and where it comes from

Build it so that each value carries its id into the pour output. The ancestry check (`node checks/claims-references-are-sound.mjs`) walks these.

| Value | Source | Kind |
|---|---|---|
| Interstate lane width, 12 ft | `f-interstate-lane-width` | finding |
| Interstate right (outside) shoulder, 10 ft | `f-interstate-right-shoulder` | finding |
| Interstate left (inside) shoulder, 4 ft, **at any lane count** | `d-left-shoulder-any-lane-count` (from `f-interstate-left-shoulder`) | derived |
| Non-Interstate freeway: the same three values, **printed per highway** | `d-interstate-std-on-non-interstate` | derived |
| Motorway with no lanes tag = 2 per direction, stamped `ASSUMED` | `d-motorway-untagged-two-lanes` (from `f-interstate-min-lanes`) | derived |
| Where the section sits on the line: the OSM line is the **centre of the travel lanes** | `m-osm-line-lane-centre` (NAIP, 5 sites, visual, ±1–2 m relative, decks excluded) | measured |
| Ramp lane width, ramp shoulders, a ramp's lanes when untagged | — | **[U]** · `q-ramp-section` |
| Lane-drop taper: length and side | — | **[U]** |
| End-to-end taper length (its end width is data) | — | **[U]** |
| Physical-gore position | — | **[U]** · `q-physical-gore-position` |
| Painted vs raised island size | — | **[U]** · `q-island-min-size` (**no painted class in v1**) |
| JR is raised (curbed on its town-street edges) | `d-jr-raised` | derived |
| Gore neutral area is flush pavement | `f-mutcd-gore-neutral-area` | finding |
| Curb width, apron / treelawn / sidewalk depths (inherited) | — | **[U]** until `q-curb-width` / `q-treelawn-default` / `q-sidewalk-default` are answered |
| Weld heading gate | — | **[U]**, a construction parameter printed per pour (measured joints: Huron p90 24.8°, max 142°; a 142° joint must **not** weld) |

## The build, in order

### Step 0 — Frame facts in `cartograph/skeleton.js`

This is A19's file (A19 landed in `9042204a`; coordinate with Wren before editing it). Home: `SKELETON §2` field table and `§3`.

1. **`ref`, voted over `sources`**, in the same shape as `chainLanes` / `gradeFacts`, and stamped on **every** chain, named ones included.
   - It is a label for choosing the section. ⛔ **Never a weld key** (`US 6;SR 2` concurrencies exist).
   - Unknown after the vote → `ref: null`, and the pour prints *"Interstate status unknown"* per chain. ⛔ Unknown is never read as "not an Interstate".
   - Measured 2026-09-23 on the artifacts: LS 11/82, HPDM 0/160 and Altadena 0/34 highway chains carry a ref today. That gap is why this step exists.
2. **Two-way ruling (a).** A two-way `motorway`/`motorway_link` gets `gradeSeparated = entirelyOffGrade` only, and the pour prints it by name. Today that is exactly LS's `south-18th-street-10`.
3. **The highway weld (ruling f).** It runs **after** the synthetic numbering loop (`PRE_A19_UNNAMED` ordering).
   - It joins highway chains tail-to-head: same direction, degree-2 node, turn below the gate **[U, printed]**.
   - The survivor keeps its id; member ids stay in `sources`/`osmIds`.
   - **Lanes are carried per span** (a station-keyed lane profile). Lanes step across 10 Huron joints and 13 LS joints.
   - Measure joints on the **flattened** geometry. Skeleton `points` are bezier **control** points wherever `segments` exist (`SKELETON §2`), so 2-point chains are not stubs.
   - **Gates (both must stay green, on every scene):**
     - `node checks/claims-authored-skelids-keep-their-ways.mjs` (HPDM's `primary-link-192/-197` are authored)
     - `node checks/claims-a-pour-keeps-building-ids.mjs`

### Step 1 — The typical section (`src/cartograph/streetProfiles.js`, `measureFromSeed`'s `isHighway` branch)

- Replace the class constants (`TYPE_PAVEMENT_HW.motorway / _link / trunk / trunk_link`) with a section resolved per span from lanes, `ref`, class and `oneway`.
- **Composition** (anchored by `m-osm-line-lane-centre`). With point order as the direction of travel, so the driver's right is `right`:
  - `left = n·w/2 + leftShoulder`
  - `right = n·w/2 + rightShoulder`
- **Two-way highway:** both sides take the right-shoulder value.
- **The section is asymmetric by design.** Stamp each side's value with its source id(s) and `lanesSource: osm | ASSUMED`.
- Stamp `pedRealm:false` on every highway side (Wren's key), so the **shipped** resolver zeroes the ped band there. That also closes S3: today highway-facing edges get the standard band, because `resolvePedDepths` ignores `terminal:'none'`.

### Step 2 — H, the highway polygon (`src/lib/tileGround.js`, the `for (const s of gradeSep)` loop)

- **Delete `WIDE_SPACING` and the `smoothChain` resample on grade-separated chains.** Sweep the **same flattened points ① consumes** (`ribbons.json`), left by `left(station)` and right by `right(station)`.
  - Build it the way the mint does: explicit outlines, right boundary forward and left boundary back, **not** `ClipperOffset`. Each vertex then carries its source index and side (`RIBBONS §1` on why an offset can't carry side).
  - Faceting is a curve-fit question at the skeleton (`SKELETON §3.5`), **not** a consumer smoothing. That is `q-highway-smoothing`, answered by `r-ssot-skeleton-geometry`.
- **Butt ends.** At a lane step, taper over **[U]** length; the pour prints each taper.
- `HIGHWAY_CLASSES` chains union into `highway`.
- **Non-highway grade-separated chains:**
  - pedestrian → the path ribbon;
  - vehicular bridge → a flat stroke at its own seed, listed by name (ruling i).
- ⛔ **Delete the silent skip** `if (hw <= 1e-6) continue`. A highway with no width is a loud error, named.
- Also delete the stale `[PROTO②] … region(s) skipped` log (no skip exists since 2026-09-06).

### Step 3 — One edge: the new curb producer (`tileGround.js`, ②, `mkDepth` / `protoMeasureOf`)

- **A highway-owned ① label resolves to depth 0.** Then difference the block's ② ring against H. Stamp `producer: 'highway-difference'` plus `producerReason` on the tile, as `A07` does.
- **Curb corners where a town curb meets the highway edge are sharp.** A highway has no curb return.
- **The curb stroke skips highway-owned edges.**
- **Authoring on a highway label (ruling `r-highway-no-authoring`):**
  - `bcOf` returns nothing for a highway-owned owner, and the pour **prints the override by name** rather than applying it.
  - ⚠️ This deliberately differs from Wren's expressway rule, where an override wins.
- **Overlay entries that land on a highway-class chain are kept and printed by name, never dropped** (Boz's backstop).

### Step 4 — The region classifier: replace the `isGs` majority vote (`tileGround.js`, ②)

One pass, **in this order**:

1. **Verge.** Every street-owned label is highway-owned, or is an **overpass span**: a non-highway run on an off-grade chain (`bridge`/`tunnel`/`layer≠0`) sitting between two highway runs in the ring's cyclic order. Rim (`__boundary__`) and water labels are neutral.
   - Build: ①-hole − H, **no curb, no ③ bands**, land use `verge` (a new ③ class; grass; no choice).
   - Measured 2026-09-23 with `scratch/h3-verge-overpass-probe.mjs`: Huron 1 → 13, LS 7 → 13.
2. **JR, the junction residual.** An at-grade ramp end is on the ring, **and** zero RAW footprint centroids lie inside.
   - Carry the ramp end as an identity stamp. The mint stamps `gradeEnd: 'start'|'end'` on a highway chain's endpoint vertex when it shares a vertex with a non-highway street, the same way it already stamps `tipEnd`. ⛔ Never recover it by proximity (`A15`).
   - ⛔ **No building layer in the pour → refuse the classification, by name.** Never "no buildings ⇒ everything is JR".
   - Build:
     - highway edges bare (depth 0, − H);
     - town-street edges: a curb at the street's resolved width, then ③ at that street's **own resolved** ped depth, read with authoring loaded, with **both strips concrete** (the strip-swap material fields);
     - remainder land use `verge`.
   - Measured candidates: LS 19, Huron 9 (`scratch/h3-jr-park-guard.mjs`).
3. **Block.** Everything else. Highway-owned edges are bare; `pedRealm:false` handles the ped band, step 3 the curb.
- **Gore** (`f-mutcd-gore-neutral-area`). Where a ramp's H meets its mainline's H, the union is the flush neutral area.
  - ⛔ **No gap-close constant.** The physical-gore position is **[U]**, so the sliver beyond the union stays verge.
  - The pour counts gore slivers by id.

### Step 5 — The joins (design review Q6, `cartograph/_archive/BRIEF-highway-positive-object-SUPERSEDED-2026-09-23.md`)

- **At grade** (a ramp end shares a vertex with a town street). H butts at the town centreline. The town asphalt draws over it: 2D `renderOrder` `PRI.residential+1` sits under asphalt's 8, and the 3D stack in `bake-ground.js` has `highway` below the ribbons. Check 5 asserts the butt lies inside the town asphalt.
- **End-to-end** (Huron US 6: `motorway-35` → `primary-91`, `primary-103` → `motorway-36`, at (−560, −179) / (−524, −195)).
  - H tapers from its section to the at-grade street's **resolved per-side** width at the node, read with authoring loaded. The taper length is **[U]**, printed.
  - One material handoff, at the taper's end.
  - The crossover `primary-link-54` (sidewalks on a crossover) is **flagged, not ruled**. List it; don't change it.
- **Grade-separated.** Draw order only (ruling h). Nothing to build.

### Step 6 — Loud disclosure, printed on every pour

- Per highway: the section source ids, and `lanesSource`.
- `ASSUMED` lanes, by id.
- *"Interstate standard applied to non-Interstate"*, by id.
- *"Interstate status unknown"*, by id.
- Every **[U]** value used, by id.
- Two-way reclassifications.
- Highway authoring overrides refused.
- Per town: verge / JR / block counts, the building-less-JR count, and the parcel-vs-building disagreements.
- Gore slivers.
- Missing-width highways (an error).

## The seven checks

Each check **reads the source, never restates it**, and must be **seen to fail** by a named mutation (`MEMORY §C`, *"a passing check proves nothing until seen to fail"*).

| # | Check (new file under `checks/`) | Reads | Surface | Asserts | Mutation that must turn it red |
|---|---|---|---|---|---|
| 1 | `claims-highway-no-visible-joint.mjs` | `skeleton.json` + `ribbons.json` (flattened) | pre-wall data | Every weldable joint (degree 2, same direction, under the gate) is **interior** to one chain. Nothing is drawn alone at a weldable joint. | Disable the weld. |
| 2 | `claims-highway-width-from-lanes.mjs` | `ribbons.json` measures + `references/registry.json` + `streetProfiles.js` source | data | Each highway side = the composition above, from lanes and the cited values. Every value carries a source id. **No** `TYPE_PAVEMENT_HW` highway keys survive. An Interstate-cited value appears only on a `ref`-identified Interstate. | Restore the constant. Drop one chain's `lanes` (it must appear as `ASSUMED`). Tag a non-Interstate as cited. |
| 3 | `claims-block-edge-is-highway-edge.mjs` | `public/baked/<t>/shape.json` (`iaFull` + `iaStamp` + `highway`) **inside the stencil only** (the frozen `highway` is stencil-clipped) | **frozen**: Measure / Section | Highway-owned curb vertices lie on H within the Clipper grid tolerance. The source has no `WIDE_SPACING` and no `smoothChain` on grade-separated chains. Baseline, red today: Huron 294/1306 and LS 634/1836 vertices over 0.5 m (`scratch/h3-one-edge-gap.mjs`). | Offset H by 0.1 m. Restore `smoothChain`. |
| 4 | `claims-highway-handedness.mjs` | `ribbons.json` + the `highway` output | data + frozen | On one-way carriageways, `right ≥ left`, and H's right edge is on the geometric right of travel. | Swap the sides. |
| 5 | `claims-ramp-ends-classified.mjs` | `skeleton.json` + the stencil | data | Every in-disc degree-1 highway end is one of: at-grade · gore (on a highway interior vertex) · off-rim · a named exception. Each at-grade butt lies inside the town asphalt. | Nudge one endpoint 1 m. |
| 6 | `claims-verge-bare.mjs` | `shape.json` + `ground.json` | frozen + 3D | Verge tiles carry 0 curb and 0 ped area and land use `verge`. Mixed tiles carry 0 ped on highway-owned edges. | Re-enable ped on a highway label. |
| 7 | `claims-junction-residual.mjs` | `shape.json` + `raw/msbf.json` | frozen | Every face with a `gradeEnd` on its ring is block or JR, none unclassified. JR faces: 0 grass strip, 0 curb on highway edges, land use `verge`. Frontage reads the **RAW** file. The reach-in-junction-boxes column is printed as a **diagnostic, never a gate**. | Move a building centroid into an island (the face flips). Drop the building layer (loud failure). Swap in the shown set (a hidden building flips its face). Strip the `gradeEnd` stamp (red). |

**Standing gates, green before and after:**
- `claims-authored-skelids-keep-their-ways`
- `claims-a-pour-keeps-building-ids`
- `claims-a-frontage-can-ask-for-no-ped-band`
- `claims-simplify-preserves-authoring` (the mint gains a stamp)
- `claims-references-are-sound`

## Acceptance — THE COMB

Each question below is a tooth (`references/README.md` §The comb). The build is accepted when **each is held by a check in code**, and its `check` field is set in `references/registry.json` in the same commit that lands the code.

| Tooth | Held by |
|---|---|
| `q-freeway-lane-width` | check 2 |
| `q-freeway-shoulders` | checks 2 + 4 |
| `q-osm-line-placement` | check 2 (the composition centres the lanes on the line) |
| `q-highway-model` | checks 1 + 3 + 6 + 7 |
| `q-highway-smoothing` | check 3 (`WIDE_SPACING` retired; one geometry). Answered by `r-ssot-skeleton-geometry`. |
| `q-freeway-inside-shoulder-3plus` | check 2 (`d-left-shoulder-any-lane-count`) |

## Surfaces and eye targets

- **Survey** renders LIVE (the `tileGround` live path) but **draws no ped depth** (`SURVEY §0`). Eye the shape there; eye the **ped** in **Measure**.
- **Measure / Section** read the frozen `shape.json`. The 3D view reads `baked/<look>/ground.json`. Checks 3, 6 and 7 need a re-pour first.
- **Huron is the eye target:**
  - the US 6 freeway end, (−560, −179) / (−524, −195);
  - the SR 2 × Mudbrook interchange infields;
  - the Rye Beach interchange.
- **LS second:**
  - Jefferson × I-44;
  - Truman Parkway × I-55/I-44;
  - 18th × Lafayette.
- **HPDM is held**: its `shape.json` predates ①. Altadena likewise. Re-pour before any gate reads them.
- ⛔ Don't eye-gate on a proxy (`feedback_proxy_render_is_not_the_operator_eye`).

## Coordination

- **One checkout, several sessions.** Commit only your own paths, by explicit pathspec, after `git status`.
- **Never** stash, reset, rebase or switch branch here.
- **Announce any pour before running it**, meaning anything that writes `cartograph/data/` or `public/baked/`. A Bake on any OSM town now re-runs pipeline + promote-ribbons (Wren, 2026-09-23), so any Bake can move a town's `ribbons.json`.
- **Record the artifact mtimes** with every measurement.
- **Commits name their register** (`FEATURES` / `OPERATIONS`), or say "reaches no register" (`CLAUDE.md`). This build reaches `OPERATIONS`: the disclosure lines are operator-facing.

## Probes to reuse (don't rebuild)

All committed in `4d41ee2b`, `scratch/h3-*`:
- `verge-overpass-probe`
- `one-edge-gap` (inside the disc)
- `highway-joints`
- `terminal-islands` (format frozen; the NAIP spike reads it)
- `junction-box-probe`
- `jr-park-guard`
- `jr-parcel-test`
- `orphan-curb-probe`
- `naip-centreline.py`, the measured root; it runs on `scratch/.naip-spike/.venv`, which is uncommitted
- `aerial-centreline.py`, **superseded** (Esri terms unchecked); don't cite it

⚠️ **Probe tile numbers are positional within one pour.** Match regions by coordinates, never by index.
