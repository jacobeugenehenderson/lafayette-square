# BRIEF — corners carry ramps and crosswalks, and the kerb is raised

<!-- BRIEF-STATE
status: OPEN
dispatched: Sill
written: 2026-10-05
evict-when: RULING: Jacob passes the corners on Huron by eye (curb cuts, perpendicular landings, crosswalks, the per-corner Survey and Section controls) AND LS's raised-kerb ground bakes without refusal (§9 Open — the snap-rounding mesh cut) or that item is re-boarded to ROADMAP by his call.
-->

**You are the dispatched agent. Name yourself** — one word, yours, not one a RUNNING session holds
(`ListAgents`, then `/rename`). **Agent: FRESH** — the corner canon is long and hard-won and must be read
whole, with no assumptions carried in from another window.

**Instruction: confirm-then-build.** Read the canon and code below, tell Boz what you found (**report to the session
`Boz the Younger`**), and if the code contradicts this brief — **stop and flag**. ⭐ This brief touches SECTION's ruled
corner; the stop is cheaper than a fifth reverted corner pass (`_archive/RIBBONS-history-2026-06-12.md §7`).
**Night 1 is landed (§9); your work is §3, in order.** ⭐ **Vocabulary (ruled 2026-10-06, A1):** the place the kerb
drops is a **CURB CUT**; "ramp" stays SECTION §4's pad and the leg slope. This brief's older text says "ramp" for
the curb cut — read it as curb cut.

---

## 0. What this is — three rulings (Jacob, 2026-10-05)

Real corners have things ours do not: where the kerb actually DROPS (one diagonal ramp, a perpendicular
pair, or none), detectable-warning tiles at each ramp, crosswalks that meet the ramps across the street,
and a kerb with height. NYC records curb cuts (`CURB_CUT`, 2022 planimetrics), which made the gap
visible — but this is **kit-general**: every town gets it, evidence or no evidence.

1. ✅ **A ramp is a POSITION on the corner's arc; the pad is unchanged.** The ADA pad (SECTION §4, "the
   RAMP") stays exactly what it is — concrete from tangent to tangent, reaching the kerb. A corner now
   also carries a short list of **ramps**: where along its arc, how wide, whether it has a warning strip.
   A ramp marks where the kerb drops and where the warning tiles go. ⛔ It is a SLICE of the same band,
   never a constructed primitive (RIBBONS §1, invariant 1; SECTION §4 "the corner constructs nothing").
2. ✅ **Crosswalks live on the same arc** — a crosswalk runs from a ramp to the matching ramp across the
   street. Same object family, same corner record.
3. ✅ **The kerb is RAISED** — real height, dropping to zero at each ramp. ⚠️ Today the ground is one flat
   plane; nothing in `bake-ground.js` or `BakedGround.jsx` knows kerb height (grep, 2026-10-05). This is
   the largest part of the brief and is kit-wide.

### ⭐ THE LAYER, NAMED FIRST (`CLAUDE.md` route step 4)
- **Ramps, warning strips, crosswalks = FILL (Section).** They are slices and materials of the band
  stroked inward off the frozen curb; they never move the curb. A change that moves `iA` is out of bounds.
- **The raised kerb = a BAKE attribute of the curb strip, not a SHAPE change.** WHERE the kerb is stays
  SHAPE (① → ②, Survey, frozen in `shape.json`); this brief gives that frozen strip HEIGHT at the ground
  bake. ⛔ If raising it appears to need the curb re-drawn, that is a SHAPE question — stop and flag.

### Where each corner's ramps come from — the same layering as everything else
1. **Evidence where it exists:** a city curb-cut layer (NYC `CURB_CUT`, acquired by
   `BRIEF-nyc-adapter.md`), or OSM `kerb=lowered` / `highway=crossing` nodes (`ROADMAP A09` — those tags
   are currently DROPPED at ingest; fixing that is in scope if you need them).
2. **Otherwise a rule:** the town's or state's norm (NYC: a perpendicular pair per corner; an older
   town: one diagonal at the apex). ⛔ The norm is AUTHORED per town/state with a neutral default —
   never a constant that happens to be right for the first town (`CLAUDE.md` Layer 0, Class D).
3. **The operator overrides any corner** — a Section gesture (ramp style / positions).
Every ramp carries its source, exactly like widths (`ROADMAP A23`).

## 0a. ✅ RULED after the pre-build report (Jacob, 2026-10-05) — these override §3's sequence where they differ

1. **The ramp override lives on each LEG's existing slot** — `blockCustoms[skelId][side][segOrd]`, e.g.
   `ramps: { start, end }` ("a ramp at my corner end"). Identity rides `iaStamp`; nothing is recovered.
   When the two legs disagree, **authored wins**, the same precedence the frontage resolution uses.
   No new authoring channel, no corner-keyed table, ⛔ never the per-ring arc ordinal.
2. **+ 3. THE LEGS DECIDE** (Jacob, 2026-10-06 — supersedes the junction-DEGREE stamp first ruled here: *"LS was
   made with a mentality that a corner was a result of the legs which made it"*). A corner whose two legs (the runs
   owning the edges either side of its arc, off the frozen `iaStamp`) are DIFFERENT roads is a junction — curb cuts +
   crosswalks; the SAME road (`RIBBONS §3.3`: `roadId` OR `throughId` agrees) is a bend — pad only; a leg with no run
   is UNKNOWN, counted by cause. Crosswalks pair on the mint's frozen chain-pair node (`nodes[legA|legB]`) + the
   crossed chain's two sides. ⛔ Not a degree re-derived from the chains (`EXTENT-DESIGN §4.1`), not a ray-and-snap
   (`A15`). ⚠️ It changes the frozen artifact ⇒ it reaches the map with the **re-pour**.
   **First, read-only:** measure per town how many eased corners are bends, and post it.
   ✅ **Measured (Flare, 2026-10-05, from `public/baked/<town>/shape.json`):** bends are LS 9.2% · HPDM
   13.1% · huron 10.9% · provincetown 27.9% of arcs — and the count MOVES with the road key (raw skelId
   vs ordinal-stripped), which is why owner labels cannot decide it. ⭐ **The junction id must be stamped
   from ① itself, independent of the owner stamp (`iaStamp`)** — arcs with a null-stamped flank (LS 122,
   huron 338, provincetown 146; cause not established) are otherwise unclassifiable.
   ⛔ This lifts §7's "no change to ①/② construction" bound **for this stamp only** — the shape itself
   does not move; `a03-curb-identity` / `claims-repour-changes-nothing` must show geometry unchanged.
4. **The raised kerb lifts the WHOLE BLOCK inboard of the kerb face** (curb, walk, lawn, land use) by an
   authored height with a neutral default; asphalt stays at 0; a riser along `iA`; each ramp is the walk
   sloping h → 0. Buildings, trees and lamps ride the lifted ground. ⛔ Not a lip strip, not a
   riser-only look ("it's only seen from far" is not an available argument). **Measure this option's
   cost first** (flatten, coplanar check, AO, anchors, phone-lo frame time) and stop with the numbers.
5. **Default ramp style = NONE, loudly.** No ramp markers without evidence or an authored town/state
   norm, and every pour prints *"N corners have no ramp source"*. The pad is unchanged regardless.
6. **Rot found, to fix in the same landing as the code it describes:** `SECTION §6.1`'s "TL↔TL is GRASS
   AT THE KERB through the whole arc" (contradicts §4) and the painter comment near "THE CORNER — READ,
   NOT MEASURED" ("AND the owner changes" / "a mid-block BEND is NOT a corner") — both against the code.

7. ✅ **LS's norm (Jacob, 2026-10-05): the 45° DIAGONAL corner, ramp 1.5 m, warning strip 0.6 m.** (Briefly
   ruled perpendicular the same evening, then revised.) Written to `cartograph/data/lafayette-square/norms.json`.
8. ⭐ **Each CORNER's style is its own (Jacob: "our system will need to be able to tell the difference between
   45 degree corners and perpendicular sets").** A town's norm is only the default. Per corner: **evidence** —
   curb-cut positions along the arc (NYC `CURB_CUT`; OSM `kerb=lowered` where mapped): one cut at the arc's
   middle ⇒ diagonal · two near its ends ⇒ perpendicular · none ⇒ no ramp · anything else ⇒ `unreadable`,
   counted, never guessed → else the **town norm** → **override** on top. The census reports each rung
   separately. ⛔ Binding a cut to a corner is by containment in the arc's own span, never nearest-arc.
9. ✅ **RULED (Jacob, 2026-10-05): crosswalks run square across the street.** *a crosswalk always runs square across the
   street it crosses*; at a perpendicular corner it ends at that leg's ramp, at a diagonal corner it ends where
   the square crosswalk meets the kerb and the apex ramp lands inside it. (Literal ramp-to-ramp at diagonal
   corners crosses the intersection box diagonally — Flare, landing 2.) Build it with per-corner style (item 8).

## 1. Read first — whole, not sampled

- `cartograph/SECTION.md` **§4 entire** (RAMP vs SLOPE, "the legs decide the corner", the TL↔TL blunt end)
  and **§6** (the corner construction + the "how to change the corners" guide).
- `cartograph/RIBBONS.md` **§1** (the invariants; "the corner is where ① TURNS").
- `cartograph/_archive/RIBBONS-history-2026-06-12.md` **§6.9** (AASHTO/ADA corner doctrine) and **§7**
  (every corner attempt and why it was reverted).
- `ROADMAP` **A7** (corners declined 17–63% by town — a ramp needs a corner that exists) and **A09**.
- `cartograph/ARCHITECTURE.md §8` (the single-plane ground; `flattenPaintStack`; coplanar groups).

## 2. Code sites

| what | where |
|---|---|
| the FILL construction, per tile | `src/lib/tileGround.js#sectionPassTile` |
| the ramp/slope edges | `tileGround.js` — grep `walkFromD`, `walkToD`, `rampLen` (read `rampLen` as the SLOPE's run) |
| corner arcs and their stamp | `tileGround.js` — grep `iaCorner`, `filletRing`, `cornerFillets` |
| the curb width | `tileGround.js#edgeDepth` (`curbWidth` is authored per Look) |
| the flattened ground plane | `cartograph/bake-ground.js#flattenPaintStack`; renderer `src/components/BakedGround.jsx` |
| ground conformance (anchors sit on the drawn ground) | `cartograph/ARCHITECTURE.md §8 "Ground conformance"` |

## 3. Sequence — the work after night 1 (Boz, 2026-10-06; Jacob: "attack all the corner brief issues now")

Each step lands alone, with its check mutation-tested (seen to FAIL on the old code). Steps 0–3 share one re-pour
of the four towns at the end; ⛔ confirm with Boz before ANY pour or bake — Jacob's machine is in use by day and
Jackson Heights bakes tonight.

0. **⛔ The town's norm never reaches the pour — fix first.** `cartograph/ramp-norm.mjs#resolveRampNorm` defaults
   `dataRoot = 'cartograph/data'`, resolved against the CALLER's working directory. The pour runs `derive.js` from
   `cartograph/`, so it looks in `cartograph/cartograph/data/…`, finds no `norms.json`, and freezes **`none (kit)`
   without a word**. LS's diagonal norm has never reached its map (measured 2026-10-06: `src/data/ribbons.json`
   `rampNorm` = none/kit; the resolver run from the repo root reads diagonal). The check passed because it runs from
   the root. Fix: resolve from the module's own location; a scene whose data directory does not exist THROWS. The
   check must run the resolver the way the pour does, and must fail on today's code.
1. **The rename: curb cut** (A1). One commit; the old names are GONE — no alias, no dual-read, no shim.
   | rename (the drop) | ⛔ do NOT rename |
   |---|---|
   | `ramp-norm.mjs`, `resolveRampNorm`, `RAMP_STYLES` · the frozen `rampNorm` (changes with the re-pour) · `norms.json` key `ramps` (LS's only file) · the leg slot `blockCustoms[…].ramps.{start,end}` (nothing authors it yet — grep all towns to confirm) · `tileGround.js`'s `rampsOnJunctionCorners`, `rampRecs`, `rampTally`, `noRamp`, `crosswalksBetweenRamps` · the ground class `ramp` (`bake-ground.js`, `bake-ground-ao.js`'s `PAVED`) · the layer id/label "Curb Ramps" and colour `ramp` (`Panel.jsx`, `CartographSurfaces.jsx`, `m3Colors.js`) · `checks/claims-every-junction-corner-has-a-ramp-source.mjs` · `OPERATIONS` lines on curb ramps, `FEATURES` | SECTION §4's RAMP (the pad) and SLOPE (`rampLen`) · highway ramps in `derive.js` (`rampedCarriageways`, `rampTerminalFlares`, `rampSign`, the H-3 flare) · `m3Colors.highway`'s comment |
   ⚠️ Judge every hit by its SENSE, not its spelling; list in the commit what was renamed and what was left, and why.
2. **Each corner's own style from evidence** (§0a item 8). ✅ RULED (Boz, 2026-10-06): a crossing's landing is
   CROSSWALK evidence (step 3), never cut style — at a diagonal corner a square crosswalk also lands near the arc's
   end. Cut evidence = the physical drop: OSM `barrier=kerb`/`kerb=*` nodes (`fetch-kerbs.mjs` → `raw/osm_kerbs.json`,
   additive) or a city file. Bind on raw `osm.json`, never `clean/skeleton.json` `paths`: the skeleton simplifies the
   roads, so only ~20–30% of crossings keep their shared road vertex there (86–96% in raw, by exact lon/lat). A landing
   is the record's own line to the first frozen curb, kept only if the crossed road is one of the arc's legs.
   ▶ `cartograph/curb-cut-evidence.mjs` (the record contract a city file fills) · `claims-every-junction-corner-has-a-curb-cut-source --selftest`.
3. **Square crosswalks + the T's far kerb** (§0a item 9; T ruled 2026-10-06). At a diagonal corner the crosswalk ends
   where the square crosswalk meets the kerb. The far kerb of a T is a NORM on the crosswalk ladder: kit default =
   **no crosswalk** across the through street; **LS = a curb cut on the far kerb, crossed to** (LS 360 such crossings).
4. **The operator gesture** that writes `blockCustoms[…].curbCuts.{start,end}` in Section — read by the painter,
   written by nothing today. ⛔ Show Boz the gesture's design before building it; Jacob's eye rules a UI.
5. **The raised kerb** (§0a item 4; ruled 2026-10-06). Cost already measured (§9).
   - A riser **wherever a curb is drawn today**, and only there — road types already ruled curbless (alleys, highway
     verge) get none.
   - The whole block inboard of the kerb lifts; each curb cut slopes h → 0; asphalt stays at 0.
   - Buildings, trees and lamps RIDE the lifted ground. Today the anchor sampler ignores the mesh's y, so they would
     bury by h; fix the sampler, don't offset the objects.
   - Height is a jurisdiction value on the same norm ladder (`norms.json` → state → kit **0**); LS = **0.15 m (~6 in)**.
     ⛔ Height and width are SEPARATE knobs, never coupled: the width is the Look's `curbWidth` slider, authored wider
     on LS for looks (0.381 m) and left alone (Jacob, 2026-10-06: *"I made the curbs wider for cosmetic reasons"*). A
     source for a town's height (a state standard, a city's data) is welcome as a rung; record which rung it came from.
   - Measured: AO cannot see a 15 cm step (texel 1.8–10 m). Report what the step looks like at the CLOSE camera;
     ⛔ "it's only seen from far" is not an argument.
6. ✅ **The docs** (Sill, 2026-10-06). `SECTION §6.1`'s TL↔TL line and the painter comment were already conformed when
   checked; the RIBBONS conformance pass landed (A3: a warning strip or crosswalk is **paint on top, never a seam**).

## 4. The chain

- **Trusts:** ① and ②'s corner — a ramp needs a built corner arc; where A7 says a corner was declined,
  a ramp has nowhere to sit (report those, do not invent arcs). The frozen `shape.json` stamp (`iaCorner`).
- **Trusted by:** the bake (ground geometry), anchors, AO, and Preview's cost numbers.

## 5. Can the instrument see the change?

Section paints LIVE off the frozen shape (SECTION §4: the FILL is frozen nowhere) — a 2D ramp change is
visible on reload with no re-freeze. The raised kerb is a BAKE change: it shows only after a ground bake,
in Stage/Preview, never in the Designer. Name the surface on every eye-gate, and the scene.

## 6. Validation surface

Section in the Designer (2D), then Stage/Preview (the kerb). ⛔ No parallel renderer. First eye-gate on
**Lafayette Square** (the most authored town) and one other; Jackson Heights once poured.

## 7. Bounds

- Writes: `src/lib/tileGround.js` (Section corner), `cartograph/ramp-norm.mjs` (renamed), `cartograph/bake-ground.js`
  (kerb), the anchor sampler, the layer UI, checks under `checks/`. ⛔ No change to ①/② shape construction.
- ⛔ Saves under `src/lib/` and `cartograph/` are bake inputs, and saving a file `serve.js` imports restarts the
  server and kills a running bake — confirm with Boz before each landing. Commit through explicit paths only
  (`BOZ §3.7`).
- Registers: `FEATURES` (the capability), `OPERATIONS` (ramp style, kerb height knobs). Name them in the
  commit.

## 8. Done when

Every corner shows its ramps and crosswalks by rule, evidence or override, each with its source; the
kerb stands up and drops at each ramp; the checks are mutation-tested; Jacob's eye in Section and Stage,
scene recorded.

## 9. STATE — 2026-10-06 (Flare, end of night 1)

**Landed** (each commit carries its proof; ▶ the check named is the receipt). ⚠️ The four towns were re-poured 2026-10-06; LS still shows no curb cuts because its norm never reached the pour (§3 step 0).
- The legs decide junction / bend / unknown, stamped at freeze (`iaJunction`, `junctions[]`) — `3589f711` (a junction
  DEGREE, superseded) → `76d6958a` (the leg rule; the degree re-derivation excised) ▶ `claims-every-corner-knows-its-junction --build --live`
  (live mint: LS 864 junction · 99 bend · 120 unknown; every unknown is `capEdge`, the dead-end mouth class, ROADMAP A0/A10).
- The ramp norm ladder, scene → state → kit `none`, frozen with its rung — `a5760f95` (`cartograph/ramp-norm.mjs`);
  LS = diagonal 1.5 m / 0.6 m — `5648749c` → `1d4d0389` (revised from perpendicular the same night).
- Ramps on junction corners as slices of the walk band, per-leg override read, loud "N corners have no ramp source"
  — `b315b5d9` ▶ `claims-every-junction-corner-has-a-ramp-source --live --selftest` (mutation-tested).
- Crosswalks, ramp to ramp, paired by identity; `noNode` / `unpaired` / `ambiguous` counted — `38d934bf` (same check).
- The kerb's cost, measured and stopped (as §3 asked) — in the pre-build thread, not a commit: risers +2.5–15.6% of
  ground tris; anchors bury by h (the sampler ignores the mesh's y); AO cannot see a 15 cm step (texel 1.8–10 m).
- Not this brief's, done the same night: the edge fade moved from Extent to the Look, and the clip to the radius —
  `62955496` + `66547bfb` (Boz's task; `ROADMAP` carries the one open line, Altadena's disc past its bbox).

**Open:** → §3 (the sequence), and:
- ⏸ **PARKED by Jacob's call, 2026-10-07 ("not right now"): a click-to-open corner popover in Survey** (radius slider ·
  Corner / Not a corner · Revert), replacing ⌥-click. Nothing built; today's controls are the handle's drag + ⌥-click.
- ⏸ **SHELVED 2026-10-07 for the bakes (Sill, via Boz): the perpendicular fill's slivers.** Diagnosis: committed
  `a9b5e80d` re-fills each perpendicular corner with a SECTOR built beside the contour, and its seams leave 12 mm × ~1.5 m
  wedges of walk across the lawn. Thin walks on Huron: 342 perpendicular vs 5 diagonal. Plan (2), built and unshipped,
  diff at `scratch/perp-corner/radial-landings-SHELVED-2026-10-07.diff`: no re-fill and no pad on a both-lawn corner. Each
  leg's landing is a DEPTH on the one inset (`dland`, the ring split at the landing's t-bounds). Diagonal stays
  byte-identical (Provincetown; Huron with its authored corner set aside). Open reds on Huron, built with (2): thin walk
  10 vs 5 · walk behind a cut 1216/1299 · lawn apex 479/481 · concrete wedge walk 1/2. These rows were not measured at
  HEAD. One cause measured: on a one-lawn corner (tile 114, Brunswick × Cleveland Rd W) the pad's inner edge is
  `arcMin` = min(conD) = the shallow leg's 1.5 m, so a lawn ring is painted behind it and the lawn leg's walk
  (1.5–3 m) breaks at the arc. HEAD's sector hid this. The other reds: cause not established. Radial vs parallel
  landings is Jacob's look call.
- ⛔ **LS's raised-kerb ground is REFUSED (2026-10-07, Sill): 266 T-junctions after the creases are cut.** The kerb no
  longer slices the paint (that regrouped holes by winding and meshed 97,808 m² of asphalt over LS's blocks); its ramp,
  flare and taper outlines are cut into the CONFORMED mesh (`groundConformity.js#cutAlong`; Huron byte-identical, the
  cut takes ~2 s). What is left is **snap rounding**: where several creases meet within a millimetre (a cut's ramp +
  flare corners — worst at (-414.857, 684.746)), on a mesh that already carries mm slivers, crossings 1 mm apart fall in
  different weld buckets and the zero-area closers get re-cut into degenerate fans. ⛔ **Snap rounding is RULED OUT as the fix (Jacob, 2026-10-08: "I don't
  understand how this fits with the protopolygon; it exists for exactly this reason").** Cutting creases into a conformed
  mesh is the after-the-fact path the protopolygon replaces: the ramp, flare and taper outlines become pieces of the
  protopolygon, and the ground is meshed from them, with nothing cut afterwards. First question, unmeasured: does the
  protopolygon already carry the ramp outlines? ▶ offline, seconds per try:
  `node scratch/kerb-cut/dump.mjs <dir>` → the printed bake command → `node scratch/kerb-cut/harness.mjs <dir>/mesh [x z]`.
  (A constrained triangulation that takes the creases as edges up front, since earcut takes none, is the mechanism that
  meshing FROM the protopolygon may need.) Until one of them lands, LS bakes only
  flat (kerb height 0), Boz's offer to Jacob.

**Traps a fresh agent will hit:**
- ⭐ **② contour runs OPPOSITE to ①'s block ring** (875 of 876 LS corners). Read a corner's arriving / leaving leg off
  its own flank stamps; never assume a winding.
- **A corner's ① vertex is ε off the centreline** — four corners at one crossing have four. Pair across the street on
  the mint's chain-pair node, which all of them share.
- **`junctionMap.at` sits 1–10 cm off `ribbons.streets`' shared vertices** — exact-coordinate binding finds ~5%. Never
  bind by coordinate (and never nearest). The divergence is boarded under `SKELETON §0.1`.
- **A null flank stamp is UNKNOWN, never a bend** — a cap edge ends a run by construction (`capEdge`).
- **The live mint and the frozen ① give different corner counts** (LS 1083 vs 1242) — compare like with like.
- **Unnamed streets:** classify on `roadId` / `throughId`, never the ordinal-stripped skelId (`residential-70` ≠ `-73`).
- **`git commit -o -- paths -F msg`** reads `-F` as a pathspec and commits nothing — options before `--`. And zsh does
  not word-split `$VAR`: use an array for a path list.
- **Saving `cartograph/serve.js` restarts the dev server** (`node --watch`).

