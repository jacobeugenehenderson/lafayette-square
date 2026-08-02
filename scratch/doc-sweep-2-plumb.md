# DOC SWEEP — CLUSTER 2 (Polygon & Wall) — agent **Plumb**

Docs: `cartograph/PREBAKE.md` · `cartograph/POLYGON-FIRST.md` · `cartograph/WALL.md` · `cartograph/PREBAKE-POLYGONIZATION-PLAN.md`

**Claims extracted and checked: 31.** CONFIRMED **14** · FALSE **11** · UNVERIFIABLE **6**.

Method note: worked **read-only in the live working tree**, not a worktree — deliberately. Two of the cluster's
docs turn on "what is on trunk right now vs. what a commit says landed", and a worktree checkout would have
answered a different question. Nothing was written outside this file. No bakes, no pours, no dev server.

⚠️ **The single most consequential finding, up front:** `POLYGON-FIRST.md §2.1`'s largest block —
**"LANDED 2026-07-30 — the CORNER REGISTRY (`junctionMap.nodes[].corners.all`)"** — describes code that
**is not on trunk.** It was reverted with the spur work in `7b5b87a3`, and the revert took the registry,
its probes, and its evidence with it. `PREBAKE.md §4.0a` reports the revert but names only `SPUR_OUTLINE`,
so the two docs together read as *"the spur was reverted, the registry survived."* Neither statement of that
is true, and the memory ledger carries the same reading.

---

## FALSE

### POLYGON-FIRST.md §2.1 "LANDED 2026-07-30 — the CORNER REGISTRY" — **FALSE**
CLAIM: `junctionMap.nodes[].corners.all` is landed and default-on; `cornersAdjacent` is "retired"; the
table reads nodes 228→**261**, nodes carrying a corner **261/261**, corners recorded 695→**769** (160
`sameChain`), dead-end caps with a `pendant-tip` 15/50→**50/50**, blind mouth corners **6/6**.
ACTUAL: `corners.all` occurs **zero times** in `cartograph/derive.js`. `cornersAdjacent` is **still built and
still emitted** (`derive.js:4310`, `:4315`, `:4367`); the node shape on trunk is still
`corners: { outer, apex, stub }` (`derive.js:3978`). Measured on the committed `src/data/ribbons.json`:
**233 nodes · 0 with `corners.all` · 200 with `cornersAdjacent` · 24 with `corners.outer` · 29 pendant-tip
nodes · 0 `sameChain`.** `git log -S "corners.all" -- cartograph/derive.js` returns exactly two commits:
`152e7734` (added) and `7b5b87a3` (reverted). `git show --stat 7b5b87a3` reverts all 305 lines of the
`derive.js` change.
IMPACT: The corpus says the second mouth corner "is now RECORDED at prebake, at all 6 mouths that need it."
It is not recorded anywhere. Anyone taking `HANDOFF-ask-the-stamp` §C0 — *"they retire when `all` gains a
consumer"* — will go looking for a producer that does not exist. Independently corroborated at runtime:
`scratch/correctness-detector.mjs` prints **`[E3.3] corner identities: 6 corners constructed`**, the
pre-registry number; the registry's headline was 6→214.

### POLYGON-FIRST.md §2.1 — the probes it cites as SSOT do not exist — **FALSE**
CLAIM: "Probes: `scratch/stamp-mouth-audit.mjs` (does the registry record each ring-blind mouth?) ·
`scratch/stamp-predicts-fill.mjs` (acceptance #1)", and the corrected **"6 of 50"** mouth figure is
attributed to `stamp-mouth-audit.mjs`.
ACTUAL: Neither file is on disk or in `git ls-files`. `git show --stat 7b5b87a3` deletes both
(`stamp-mouth-audit.mjs` −51, `stamp-predicts-fill.mjs` −67), along with `scratch/monowidth-audit.mjs`
and four `spur-*` probes, and strips 7 lines from `correctness-detector.mjs` and 4 from
`litmus-curb-parallel.mjs`.
IMPACT: Two problems. (1) The **6 of 50** number — the one the doc insists you *"quote with the probe that
produced it, or don't quote it"* — is now unreproducible. (2) `7b5b87a3`'s own commit message asserts
*"The probes … are kept — they are diagnosis, not geometry, and they cost nothing."* **The revert did not
keep them.** That message is itself a load-bearing false claim sitting in git history, and it is why the doc
still cites them in good faith.

### PREBAKE.md §3 — "There is no block-shape polygon in `ribbons.json`" — **FALSE**
CLAIM: The top-level field list is `{streets, alleys, paths, intersections, faces, medians, corridors,
junctions?, nameTransitions?}`; the pull-quote states *"There is no block-shape polygon in `ribbons.json`
… The block silhouette does not exist until Survey builds it — every render, every bake, from scratch."*
ACTUAL: `Object.keys(ribbons)` = `[streets, alleys, paths, intersections, faces, medians, corridors,
**junctionMap**, junctions, nameTransitions, **tiles**]`. `ribbons.tiles` holds **101 block-face rings**
with per-edge `{skelId, side}` and **`caps` on 21 tiles**, frozen at prebake by `derive.js:4611`
(`extractFaces(faceStreets)` over the *skeleton*, + `detectTileCaps`, logged as `[D2] froze 101 block-face
tiles`). `src/lib/tileGround.js:2197` consumes them — `let tiles = smooth > 0 ? null :
tilesFromFrozen(ribbons?.tiles, streets)` — and the live `extractFaces` walk at `:2204` is explicitly the
**fallback** "for artifacts that carry no tiles (toy / pre-D2)".
IMPACT: This is the doc's flagship framing ("prebake freezes the *wrong* polygons", "a thin, two-source
compile"). A reader concludes D2 is unbuilt and that Survey re-walks the chain graph every build. Both are
false, and the same reader would then re-implement the face freeze. It also makes §5's first bullet —
*"Derive the block substrate from the SKELETON chains … here, once — and freeze it into `ribbons.json`"* —
read as an open target when it has landed.

### PREBAKE.md §2.5 — "LS/default … has none [no `neighborhood_boundary.json`], is untouched" — **FALSE**
CLAIM: The boundary clip is "gated on the scene carrying a `neighborhood_boundary.json` (LS/default, which
has none for this purpose, is untouched)."
ACTUAL: `cartograph/data/lafayette-square/neighborhood_boundary.json` **exists** (v2, `center [-15,-15]`,
`radius 892`, `streetFade.outer 1000`), as does one for every scene including `toy`. The gate is a bare
`if (existsSync(nbPath))` (`pipeline.js:165`), so the clip **fires on LS**, with `keepR = 1030 m`. What LS
*lacks* is a `polygon` key — which is a different fact, and it is the one that makes the building-membership
test fall back to the disc (correctly described elsewhere in the same bullet).
IMPACT: Says the wall's neuter step is inert on the mould scene. Anyone diagnosing a clipped/missing feature
on LS would rule the clip out on the doc's word.

### PREBAKE-POLYGONIZATION-PLAN.md §0/§2/§5 — the scrambled carriageway widths (D1) — **FALSE (superseded)**
CLAIM: "Carriageway-B (`lafayette-avenue-6`) carries `pavementHW = 0` on its **park-facing (outer)** side,
and `6.70` on its median-facing side. (Carriageway-A is also scrambled: 10.56 median-side / 6.86 outer.)"
— presented as cause #1 of the false corner and as the inseparable prerequisite **D1**.
ACTUAL: In `src/data/ribbons.json` today, `lafayette-avenue-6` (carriageway-B) is
`left.pavementHW = 4.6738`, `right.pavementHW = 4.6738`; `lafayette-avenue-5` (carriageway-A) is likewise
4.6738 / 4.6738. **No zero, no 6.70, no 10.56, no scramble.** Superseded by `8fd3485d`
(*"survey-based divided median — carriageway = surveyHW/2 per side"*).
IMPACT: The whole §5 spike table is keyed to that datum (rows `hwB = 0 → 10.7 m`, `hwB = 6.70 → 4.0 m`),
and §6.1 pushes back on the parent brief with *"without D1 the corner can only land within ~10 m."* D1 as
written is not actionable — the data it describes is gone. The doc's own gate for archiving is unaffected,
but its forensic conclusions are.

### PREBAKE-POLYGONIZATION-PLAN.md §3 — "`medians[]` has zero `src/` consumers … delete in the same pass" — **FALSE**
CLAIM: "`medians[]` has **zero `src/` consumers** (the vestigial decoy, per the Truman finding) — delete in
the same pass."
ACTUAL: `ribbons.medians` has **52 entries** and at least four live dereferences in
`src/lib/tileGround.js`: `:2230` (the constructed-median polys), `:2335`
(`medRings … kind === 'median' && !m.absorbedBy`), `:2611`, plus the `isMedian` classification that gates
30 tiles onto the legacy carve. `:895` and `:2210` document it as *"a CONSTRUCTED polygon frozen at
prebake"*. Superseded by `2caf8431` (*"the median is a WALKED FACE, derived — delete the stamp
construction"*), which turned `medians[]` from decoy into load-bearing.
IMPACT: This is a **destructive** instruction. Executing D4 as written deletes the divided-median
construction. It is the most dangerous single sentence in the cluster.

### PREBAKE-POLYGONIZATION-PLAN.md §3 — `intersections[]` needs re-sourcing — **FALSE (moot)**
CLAIM: Step 2, "Re-source `intersections[]` consumers. `CornerEditHandles` + the Survey IX markers read
raw-OSM `ribbons.intersections`; the skeleton's `junctions` (**329**, already in `ribbons.json`) … a direct
swap."
ACTUAL: `ribbons.intersections.length === 0` — in **every** scene checked (LS, LS-staging, altadena,
centrum, hipointe-demun, ksi-y-m-yn). The array is empty, so `ixMarkersGeo(liveRibbons?.intersections)`
(`BlockGeometryV2Debug.jsx:1105`) is already a no-op, and `:876` records that corners now come "from the
corners actually drawn (the tile graph), not legacy `ribbons.intersections`." Separately `junctions.length`
is **277**, not 329.
IMPACT: A ticket costed against work that is already done by attrition. Also makes `PREBAKE §3`'s
"`intersections[]` — from raw OSM (legacy; near-zero live consumers)" understate: the array is *empty*, not
merely unread.

### POLYGON-FIRST.md §0 ⤷ vs §3 table — the legacy carve's status — **FALSE (self-contradiction)**
CLAIM (§0 ⤷): "`iA` … is the **per-edge parallel offset** … the carve survives only as a **degenerate
fallback** `legacyBlock`."
ACTUAL: The gate is `if (opts.iaOffset !== false && !isMedianTile && ringArea > 1500)`
(`tileGround.js:3326`); everything else takes `legacyBlock()` **as its primary path**, not as a fallback.
The same document's §3 table says so: **42 of 101 tiles** route through the carve, in *structural* classes
(divided median, loop-body median, small tile), with the "degenerate" fallback row measured at **0**.
Measured independently off the frozen artifact (`shape.json` `isMedian` + ring area): **60 offset-path /
30 median / 11 small.**
IMPACT: §0 is the section a reader hits first, and it retires a construction that in fact still owns ~40%
of the map. The two readings send you at different tickets (nothing-to-do vs A06).

### POLYGON-FIRST.md §3 — the legacy-carve sub-split "9 small" — **FALSE**
CLAIM: The table splits the 42 legacy tiles as 30 divided median · 3 loop-body median · **9 small
(`ringArea ≤ 1500`)** · 0 degenerate.
ACTUAL: **30 of 101 tiles have `ringArea ≤ 1500`**, not 9; of those, 11 are non-median. The headline
"59 of 101 (58%)" measures within one tile of my reading (60), so the *magnitude* stands — but the
decomposition does not, and the "9" is quoted as a scoped work item for **A06**.
IMPACT: A06 is scoped against the wrong tile population. (Caveat on my instrument: I read `isMedian` off
`shape.json`, which may be `isDividedMedian` alone rather than the composite `isMedianTile`; that could move
the median/small boundary by ~3 but not the small-tile total of 30.)

### PREBAKE.md §4.0 — "displaces `run.poly` off the ring by up to **13 m**" — **FALSE**
CLAIM: "40 of them only LOOK resolved because the FILL-layer mouth-wrap snap displaces `run.poly` off the
ring by up to **13 m** after the freeze."
ACTUAL: `node scratch/coupler-slit-universal.mjs` — the maximum displacement over all 37 displaced tips is
**6.24 m** (next: 6.00, 5.49). Off by ~2×. (The rest of the sentence checks out: 40 fold chains carry a
mouth disc, 10 caps across 9 chains do not.)
IMPACT: Low individually, but the figure is used to argue the FILL mask's size, and the doc's own governing
lesson is that magnitudes get quoted forward without their probe.

### POLYGON-FIRST.md §5 — the detector's recall is stale — **FALSE**
CLAIM: The §5 result blockquotes end at recall **"24/31"** with *"Highest-leverage next (both named above,
**neither built**): `loop-closure` (≈7) + `cul-de-sac-cap-tangent`"*, and *"the 13 misses are the Places."*
ACTUAL: `node scratch/correctness-detector.mjs` today reports **recall 30/31 (97%)**, precision 30/61
(49%), with exactly **one** miss — **Vail Place**. Both `loop-closure` and `cap-tangent` are built (the
Loom paragraph immediately below says so, without updating the headline). Per-invariant recall is 19/31.
IMPACT: §5 is the doc that reframes the whole campaign as *"the detector is the deliverable."* Its
scoreboard reads 7 points low and names two already-built checks as the next work.

---

## CONFIRMED

- **PREBAKE §4.0 / POLYGON-FIRST §2.1 Checks 1–2 — all 50 dead-end tips are zero-width slits.** Ran
  `scratch/coupler-slit-universal.mjs`: `FACE ring is a zero-width slit at the tip: 50 / genuinely has
  width: 0`. Also confirms 40 fold chains with a mouth disc, and `tips with 2 legs: 50/50`.
- **POLYGON-FIRST §2.1 — the `south-18th-street-3` mouth walk.** `scratch/coupler-slit-anatomy.mjs`
  prints `ring[2]` and `ring[4]` at the identical coordinate `(386.30, 149.10)`, with pass 1 =
  `kennett-place → south-18th-street-3` (two streets) and pass 2 = `south-18th → south-18th` (one). The
  diagnosis — *one mouth corner is built, the other is not* — is exactly what the ring shows.
- **POLYGON-FIRST §2.1 — "98 of 107 dead-end leg slots DO have a clickable frontage edge; 9 do not, and
  all 9 have an fe on the opposite side."** `scratch/coupler-fe-coverage.mjs` reproduces it verbatim,
  including `whittemore-place|right`, `rutger-street-0|right`, `st-vincent-court-1|left`. The "bounding,
  not existence" correction holds.
- **POLYGON-FIRST §2 Check A, fault (1) — it runs with authoring OFF.**
  `cartograph/litmus-curb-parallel.mjs:77` passes `blockCustoms: null`. Confirmed by reading.
- **POLYGON-FIRST §2 Check A, fault (2) — an absent curb ring is silently skipped.** `:86`
  `if (!tile?.iA?.length) continue`. Confirmed by reading.
- **POLYGON-FIRST §2 Check A — the numbers.** Ran it: **`runs checked: 151 · VIOLATIONS: 78`**, tolerance
  0.75 m, 9 m corner margin excluded. Matches the corrected "78 of 151" exactly (and confirms the canon's
  older "38" was stale).
- **PREBAKE §4.1 / POLYGON-FIRST §2 Check B — "frozen `iA` on 93/101 LS tiles."** Exactly 93 of 101 tiles
  in `public/baked/lafayette-square/shape.json` carry a non-empty `iA`. (LS-staging: 102 of 116.)
- **POLYGON-FIRST §3 as-built — the producer split exists and its signature is the guard.**
  `freezeCurbEdgeFacts()` at `tileGround.js:185` (chain-derived) → `buildCurbRings({ring, facts,
  authoredHW, capAtVertex, curved})` at `:224` — no `streets`/`runs`/`measures`/`ribbons` parameter. The
  `authoredHW` closure at `:3286` is the sole authoring channel, applied inside the builder as described.
  `4dd05303` is an ancestor of HEAD.
- **POLYGON-FIRST §3 — "`D6a`'s comment above this gate lists DEAD-END tiles as a legacy-carve class. It is
  stale."** Correct on both halves: the comment at `tileGround.js:3305` does say "DEAD-END tiles (the round
  cap is a disk, not an edge offset)", and the actual gate at `:3326` has no dead-end condition. 21 tiles
  carry `caps` in `ribbons.json`, matching the doc's "21 tiles carry tips".
- **POLYGON-FIRST §3 — "prebake is authoring-blind by construction; `derive.js`/`pipeline.js`/
  `promote-ribbons.js` read `design.json`/`blockCustoms` zero times (every mention in `derive.js` is a
  comment)."** Verified: three hits total in `derive.js` (`:2618`, `:2619`, `:3885`), all inside comments;
  zero in the other two files. The self-documenting line the doc quotes is real, at `:3885`.
- **WALL §2 — the silent-fallback fix (ROADMAP A02) is fully built.** `shapeFreezeMissing` is a **reason
  string** on the store (`useCartographStore.js:1775`), set at **both** doors —
  `BlockGeometryV2Debug.jsx:598` (absent/empty freeze) and `:610` (fetch/parse failure) — **cleared on
  entering Survey** (`:568`), and rendered by `StatusBar.jsx:33` as a non-dismissable
  `.carto-status--alarm` banner shared with `overlaySaveBlocked` (`cartograph.css:630`). Every specific in
  that bullet holds.
- **WALL §2 / §4 — the consumer side is real.** `BlockGeometryV2Debug.jsx:581` fetches
  `baked/<scene>/shape.json` (cache-busted), `:703` renders it through `sectionOpen(frozenShape.tiles, …)`,
  and `sectionFrozen = !surveyActive && !!frozenShape` gates the live build out.
- **WALL §3 — what crosses the wall.** `shape.json` tile keys are `ring, iA, vertR, tl, sw, lu, roundTips,
  bluntTips, roundTipKeys, runs, bandJoin, cap, fillets, isMedian` — block silhouette, curb line,
  per-vertex radius, frozen measure, dead-end tip typology, as described. `vertR` on 101/101.
- **PREBAKE §2.5 — the boundary clip's mechanism.** `clipRun` keeps the longest inside run
  (`pipeline.js:192`); `keepR = streetFade.outer + 30` (`:168`); the `touches` test is inclusive (`:170`);
  building membership is `polygon ∪ activate − (exclusions ∪ hide)` with `pointInPolygon` at `:257`, and
  `bake-buildings.js:679–693` re-applies it. Only the "LS is untouched" parenthetical is wrong (above).
- **PREBAKE §2 — "`pipeline.js` reads `skeleton.json` and errors if absent."** True, via `derive.js:2431`:
  `throw new Error('skeleton.json not found at … Run \`node skeleton.js\` first.')`.

---

## UNVERIFIABLE

### WALL §4 / POLYGON-FIRST §2 Check B, §5 — "machine-scanned `scratch/hadrian-wall-open-proof.mjs`" — **UNVERIFIABLE (a), and the harness is RED**
CLAIM: WALL §4 — chain-freeness "machine-scanned (`scratch/hadrian-wall-open-proof.mjs`)". POLYGON-FIRST
Check B — "It extends the existing precedent harness `scratch/hadrian-wall-open-proof.mjs` (which
machine-proved `sectionOpen` chain-free)." POLYGON-FIRST §0.3 and §4.4 call this closure "the one
enforcement that already works."
ACTUAL: The harness **fails on trunk**, immediately: `✗ sectionOpen references chain identifiers:
blockCustoms`, `process.exit(1)`. Its `FORBIDDEN` list (`:18`) includes `blockCustoms`, and `sectionOpen`
has since gained `blockCustoms` as its 5th parameter (`tileGround.js:1907`). It never reaches the runtime
half. And that runtime half is separately broken: `:30` reads `shape.json` and treats it as a bare array
(`shapeTiles.length`), but the artifact is now `{tiles, highway}` (the G1 form — `BlockGeometryV2Debug.jsx:587`).
I am filing this UNVERIFIABLE rather than FALSE because I cannot decide *for* the corpus whether
`blockCustoms` counts as a chain identifier — it is authoring data, not a chain, so the ✗ is arguably a
false positive from a stale ban-list. But the claim as written ("machine-proved", present tense) does not
survive running the thing.
IMPACT: The cluster's only executable wall proof is red, and Check B/C are specified as *extensions of it*.
Whoever picks up Check C starts by debugging a harness, and may reasonably read the ✗ as a real regression.

### POLYGON-FIRST §2.1 — "6 of 50 mouths where the ring cannot see a corner" — **UNVERIFIABLE (b)**
The probe that produced it (`scratch/stamp-mouth-audit.mjs`) was deleted by `7b5b87a3` (above). The doc's
own rule — *"Quote the number with the probe that produced it, or don't quote it"* — can no longer be
satisfied for its own headline figure. The neighbouring 9/50 and 9-or-10/50 figures **do** reproduce off
`coupler-slit-universal.mjs`, which sharpens rather than resolves the "three sets of similar size" warning.

### PREBAKE-POLYGONIZATION-PLAN §2 — "47 carriageway transition ends at 24 distinct nodes" — **UNVERIFIABLE (b)**
Counting `phase.spineAtStart/spineAtEnd` on carriageway streets in the current artifact gives **40 ends**
and 17 distinct spine references — but `spineAt*` holds a chain `skelId` (e.g. `"south-18th-street-2"`),
not a node key, so "24 distinct nodes" is not the same quantity and I could not reconstruct the spike's
node-matching without re-running `mercator-spike.mjs` (which is not in `scratch/`). Flagging it because
D3's eyeball gate is *"sweep the 24 enumerated transition nodes"* and the enumeration is not recoverable.

### PREBAKE §2.5 — the boundary-clip result figures — **UNVERIFIABLE (b)**
"`map.json` 180 → 52 MB, ribbons 22 → 8 MB, streets 2117 → 300" and the bbox symmetry numbers were taken on
"a wide 5.4 km test fetch" that is not identified. Checking would require a pour. Mechanism confirmed above;
magnitudes not.

### WALL §5(b) / §1 — "the frozen shape is right on the operator's eye" — **UNVERIFIABLE (a)**
The Wall's definition of done has two halves and the second reduces, by construction, to Jacob's eye. That
is correct doctrine and I am not disputing it — I am recording that **half of this document's DoD has no
test**, which is exactly the condition §4.1 of POLYGON-FIRST says must be marked rather than assumed. It is
also the half that `7b5b87a3` proves is load-bearing: every probe was green and the eye said no.

### WALL §2 — "the banner cannot fire on any of the 7 scenes that have a freeze; only `default` lacks one" — **UNVERIFIABLE (b)**
The code is confirmed; the eye-gate the doc itself marks as owed ("Confirm by pointing the tool at an
unfrozen scene") is still owed. I did not drive the running dev server. One adjacent code note, offered as
observation not finding: `StatusBar.jsx` returns early on `overlaySaveBlocked`, so if both alarms are live
only the save-blocked one renders.

---

## CROSS-DOC CONTRADICTIONS

1. **PREBAKE §4.0a vs POLYGON-FIRST §2.1 — what `7b5b87a3` actually removed.** PREBAKE reports the revert
   and names only `SPUR_OUTLINE`; POLYGON-FIRST §2.1 (untouched by that edit) still presents the corner
   registry as landed. Read together they say the registry survived. **The code decides: it did not.**
   The two batons went in as one commit and came out as one commit.
2. **PREBAKE §3 vs POLYGON-FIRST §2.1 — does `ribbons.json` hold tiles?** PREBAKE: *"There is no
   block-shape polygon in `ribbons.json`."* POLYGON-FIRST: the probes *"derive every dead-end fold from the
   frozen face artifact alone — `ribbons.tiles[].{ring, edges{skelId,side}, caps{vertexIdx}}`."*
   **The code decides: POLYGON-FIRST is right** — 101 tiles, 21 with caps, frozen at `derive.js:4611`.
3. **POLYGON-FIRST §0 vs POLYGON-FIRST §3 — is the legacy carve retired?** §0 says it survives "only as a
   degenerate fallback"; §3's own table says it is the primary path for 42 structurally-classed tiles with
   the degenerate row at 0. Self-contradiction inside one doc.
4. **PREBAKE §5 / PLAN §1 (target voice) vs `derive.js` (as built).** *"Derive the block substrate from the
   SKELETON chains … here, once — and freeze it"* is stated as the target in both docs. It is built. The
   part still open is L2 (corner identity) and L3 (the stroked curb) — which is a much smaller and much more
   specific remaining scope than either doc conveys.

---

## SCOPE NOTE

One pass covered all four documents. The cluster is well-bounded — but note that **three of the four docs
were substantially edited within the last 48 hours** (`03bb9ce4`, `ec159bad`, `4e7a6096`), which is exactly
the window in which `7b5b87a3` landed. The staleness I found is not old rot; it is a revert that the docs
were updated *around* rather than *for*. If any single follow-up is taken, it should be: **re-read every
2026-07-30/31 claim in this cluster against `git show 7b5b87a3 --stat`**, because that one commit is the
common cause of finding #1, #2, and the UNVERIFIABLE on the 6-of-50.
