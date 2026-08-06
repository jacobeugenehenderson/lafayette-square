# PIPELINE CLAIMS — the dead-end → corner → sidewalk chain, in checkable prose

> **Every line here is a claim that can be checked and shown false.**
> **A falsified claim is corrected or deleted — never annotated, never superseded in place.**
> If you cannot state something as a checkable claim, it does not belong in this file.
>
> **Scope is NARROW and deliberate: one defect family.** How a dead-end tip is polygonized and
> closed · what a corner *is* and when the ADA regime fires · how the pedestrian fill arranges
> along a frontage · the SHAPE/FILL boundary between them. `ROADMAP A0` rules these are **one
> upstream fault, not three defects** — the polygon never closes at a degree-1 chain.
>
> ⛔ **Out of scope, on purpose:** the whole-pipeline distillation (frozen as a drift baseline —
> `cartograph/_archive/PIPELINE-CLAIMS-full-manifest-2026-08-02.md`, ⛔ do not cite it as true) ·
> land use · trees · the Polish pours · Stage / Preview / Bake / The Ward.

**Two labels, and they mean different things:**

| | |
|---|---|
| **[REQ]** | a **requirement** — something the system must achieve. Binding. |
| **[OUR]** | **our current answer** — one way we chose to satisfy a REQ. ⛔ A fresh designer should NOT inherit these. They exist so a falsifier can check them, and so an independent design's divergences are visible. |

**Confidence, and it is EARNED — nothing here inherited a mark from the baseline:**
✅ = I ran the probe or read the code site **this pass (2026-08-05)** · 📄 = from canon, stated but
not verified by me · ❓ = low confidence. Every numeric claim names **how it was derived** so it can
be re-run (§9 collects the commands). ⛔ **A number without its method is not a claim** — Tier 1's
own correction of the carve count under-swung because it quoted a number without the derivation.

---

## 1. The chain, in one paragraph

A dead-end street is a **degree-1 chain**. The polygon substrate is built by walking the *faces* of
the centreline graph, and a face cannot close around a degree-1 chain — the walk goes out to the tip
and back over the same vertices, so the "block" it produces is a **traversal, not a shape**. Three
visible symptoms follow, and they are one fault: the tip is a zero-width slit; the mouth gets a
corner on one side and none on the other, so one leg is bounded and the other runs through
unbounded; and the pedestrian fill — which reads leg identity and corner position off that polygon —
arranges against a boundary that is not there. Every fix attempted *downstream* of the face walk has
managed the absence rather than removed it.

---

## 2. Dead end — how the tip is polygonized

- **D1 [REQ] ✅** **The frozen polygon must close at a degree-1 chain.** It does not: **50 of 50** LS
  dead-end tips are zero-width slits — the gap between the two ring vertices at the frozen
  `cap.vertexIdx` is `0.000 m` on every one. *Method: `node scratch/coupler-slit-universal.mjs`, off
  `ribbons.json tiles[].{ring, edges, caps}`, threshold `EPS = 0.05 m`, spans walked by integer ring
  index (position collapses at a zero-width spur).* ⛔ This is a **gate to make green**, not a
  regression test that passes today.
- **D2 [OUR] ✅** The tile is a **face of the centreline graph** — `extractFaces(streets)`
  (`tileGround.js:657`) builds a planar graph from the shared vertices of `streets[].points` and
  walks its enclosed faces. **D1 is a direct consequence of D2**, not a bug inside it: the walk is
  correct; a graph face is the wrong object for a degree-1 chain.
- **D3 [OUR] ✅ ⭐** **`tile.caps` is a registry of the places the freeze FAILED to close, wearing a
  cap detector's name.** `detectTileCaps` (`tileGround.js:834`) fires when the two edges adjacent to
  a ring vertex carry the **same `skelId` on opposite sides** *and* that vertex is a chain endpoint —
  which is the sentence *"the ring doubled back here."* The artifact carries **50 caps across 21
  tiles**. *Method: count `tiles[].caps` in `src/data/ribbons.json`.* We used this as an identity
  source for months.
- **D4 [OUR] ✅** **37 of the 50 tips only LOOK closed, and the rescue is a FILL-layer patch.** The
  mouth-wrap snap displaces `run.poly` off the frozen ring by up to **6.24 m** (next largest 6.00,
  5.49); the remaining **13** sit exactly on the ring, slit and all. *Method: same probe;
  `distToRing(run.poly[i], tile.ring)` per fold, max per chain.* ⚠️ The **"up to 13 m"** figure still
  quoted in `PIPELINE §Wall` is ~2× — it is used to argue the mask's size, so it matters.
- **D5 [OUR] ✅** Mouth discs cover **40 fold-chains**; **10 folds (9 distinct chains)** have none, so
  the snap cannot fire there. The 10-vs-9 is `waverly-place-1`, which caps twice in one tile. *Method:
  `scratch/claims-deadend-set-decomposition.mjs` — `_shapeArtifact[].mouths[].spurSkel` ∌ the fold's
  `skelId`.* **Measured in BOTH states — authored `blockCustoms` and bare defaults — identical, 10 and
  10**, so this set is not an authoring artifact.
- **D6 [REQ] 📄 ⭐⭐** **The one-line test for any dead-end proposal: DOES IT CREATE THE SECOND MOUTH
  CORNER?** If not, it is another way of managing the absence. (Jacob, 2026-07-30.)
- **D7 [OUR] ✅** **The answer that was tried is GONE from the tree.** `spurOutline.js` and
  `SPUR_OUTLINE` have **zero occurrences** in `src/` and `cartograph/` — every hit is a doc describing
  the revert. *Method: `grep -rn "spurOutline\|SPUR_OUTLINE" src/ cartograph/`.* It was built
  (`152e7734`), measured green on every gate, run past the eye on two scenes, judged **WORSE**, and
  reverted (`7b5b87a3`). ⛔ **Do not re-derive that table and read it as success.**

---

## 3. Corner — what one IS, and where the missing one is

- **C1 [OUR] ✅** **A corner is IDENTITY, not angle.** `buildCurbRings`' `cornerAt(i)`
  (`tileGround.js:240`) is a real corner **iff the two edges at that vertex carry different
  `streetKey`** — `a == null || b == null || a !== b`. Same street both sides = a **through-node**:
  the curb runs straight through, no offset-intersection corner. ⭐ A **null** street on either side
  (the map boundary) also counts as a corner — a detail the prose form of the rule omits.
- **C2 [OUR] ✅** **`streetKey` is the canonical through-road id**, `throughId || roadId || skelId ||
  name` (`tileGround.js:195`). So a `continuesAs` name transition reads as ONE road and its seam is a
  through-node. *The road is the line; the name is a label.*
- **C3 [OUR] ✅ ⭐⭐** **At a doubled-back spur the second mouth pass is the same street on both sides,
  so C1 correctly declines to build a corner.** The rule is not malfunctioning. On
  `south-18th-street-3` the mouth vertex is visited twice at a bit-identical coordinate; pass 1 is
  `kennett-place → south-18th-street-3` (✅ corner), pass 2 is `south-18th → south-18th` (❌ none). One
  leg is bounded corner-to-corner; the other is an unbounded run-through. *Method:
  `node scratch/coupler-slit-anatomy.mjs`.*
- **C4 [OUR] ✅ ⛔⛔ CORRECTION — "missing a mouth corner" and "a leg running through the mouth" are
  the SAME 9 folds, not two different measurements.** Set-identical, member for member:
  `allen-avenue-0[start] · carroll-street-0[end] · geyer-avenue-0[end] · mackay-place-1[start] ·
  park-avenue-3[end] · south-13th-street[end] · south-18th-street-3[end] · waverly-place-1[end] ·
  waverly-place-1[start]`. *Method: `node scratch/claims-deadend-set-decomposition.mjs`, both sets
  derived from `mouthInfo()` over the same 50 folds; `A ∩ B = 9`, `A only = none`, `B only = none`.*
  ⛔ `POLYGON-FIRST §2.1`, `PIPELINE §Wall`, `README` and `ROADMAP A0` all state these are **distinct
  measurements yielding 6 and 9**. The **6** came from `stamp-mouth-audit.mjs`, which `7b5b87a3`
  **deleted** while its own commit message claimed the probes were kept — so 6 is unreproducible by
  the very rule that section states. **The reproducible number is 9, for both.**
- **C5 [OUR] ✅** Of those 9, **4 present only ONE mouth pass at all** rather than two passes with one
  corner missing. *Method: same probe, `mouthInfo().passes.length <= 1`.* ⚠️ These are a **different
  condition** sharing a counter — `POLYGON-FIRST §5` Rule 3 (one invariant, one defect) says split
  them before anyone sizes work off "9".
- **C6 [OUR] ✅** **41 of 50 spurs DO get a corner at every mouth pass.** Sizing a prebake re-founding
  off *"all 50 are unbounded"* overstates the prize by ~5×. *Method: `coupler-slit-anatomy.mjs`,
  Check 5 map-wide.*
- **C7 [OUR] ✅** **The defect is BOUNDING, not EXISTENCE.** **98 of 107** dead-end leg slots have a
  clickable frontage edge; **9 do not**, and all 9 have an fe on the opposite side. *Method:
  `node scratch/coupler-fe-coverage.mjs`, 842 fes map-wide.* ⚠️ But bounding also holds on 41 of 50
  (C6) — **both the "nothing to click" claim and its correction over-swung**; this line is the third
  statement of that number and it is the one with a live probe behind it.
- **C8 [OUR] ✅** **The corner registry (`junctionMap.nodes[].corners.all`) is NOT on trunk.**
  `ribbons.json` carries `corners` on **233 of 233** nodes with keys **`outer`, `stub`, `apex` only**,
  and `cornersAdjacent` is still present on **200** nodes — i.e. it was never retired. *Method: key
  census over `src/data/ribbons.json` `junctionMap.nodes[]`.* Read the registry section of
  `POLYGON-FIRST §2.1` as a design record of an attempt, not as shipped behaviour.
- **C9 [REQ] 📄 (L3)** **The corner is the band BENT around the arc — a slice of the same continuous
  concentric offsets, NEVER a separately-constructed primitive.** ✅ The code honours this: the FILL
  corner is `arcSectorPoly` (`tileGround.js:586`, called `:1580`) — a wedge whose outer edge **is the
  frozen curb arc** — sliced from the band, not built beside it.
- **C10 [OUR] ✅** **The corner bid is suppressed at a tip, a through-node, a name transition and a
  T-continuation** (`tileGround.js:1411-1413`) — so the frontage stays one uninterrupted chain from
  real corner to real corner, which is the governing rule.
- **C11 [OUR] ✅** The SHAPE corner is frozen as a fillet on **93 of 101** tiles. *Method: count
  `fillets[].length > 0` in `public/baked/lafayette-square/shape.json`.*

---

## 4. Sidewalk — how the fill arranges, and why runs swap

- **S1 [REQ] ✅** **Every edge gets a sane default with no operator action; authoring is override
  only.** `resolvePedDepths(baseMeasure, side, custom)` (`tileGround.js:1003`) returns a depth with
  `custom = null`. The operator never starts from blank — they correct.
- **S2 [OUR] ✅ ⭐** **Two strips ALWAYS, EQUAL width — they SWAP, they never collapse.**
  `STD_TREELAWN = 1.5` and `ADA_SIDEWALK = 1.5` (`tileGround.js:925-926`) are the same number, and
  the gleaned `hasTL` drives **only the material ordering**, never a width. A sidewalk-only edge is
  "sidewalk then lawn" at full ribbon depth, not a half-ribbon. This is what keeps the ribbon
  mono-width so the bent corners stay concentric.
- **S3 [OUR] ✅** **Treelawn Y/N is gleaned from measured data, not guessed** — the natural gap
  `measure[side].treelawn >= 0.6 m` (`TREELAWN_YN_THRESHOLD`, `tileGround.js:924/929`).
- **S4 [OUR] ✅ ⭐** **Treelawn-Y is a 30% MINORITY, not a majority.** Over the shipped artifact's
  **418 street-sides**: **127 Y · 269 N · 22 valley**. *Method: `measure[side].treelawn` per street
  per side in `src/data/ribbons.json`; reporting bands `>0.75` / `<0.25` / between — deliberately
  wider than the 0.6 m glean threshold so the ambiguous band is visible rather than forced.* ⛔ The
  old `n=951 / 391 / 508 / ~50` breakdown is **struck as unreproducible**, and the **DEFAULT-FILL
  front was sized off it** — re-size before dispatching that work.
- **S5 [OUR] ✅ ⭐** **The ADA transition fires ONLY on arrangement-DIFFERENCE — and width counts as a
  difference, not just parity.** `tileGround.js:1791`: the coupler `continue`s when
  `legWalkOuter === capWalkOuter && |legTotal − capTotal| < 1e-6`. So an inherited cap builds no
  transition and stays byte-identical. ⚠️ **`0f0a6473` is the RATIFICATION, not the landing** — it is
  a 73-line docs-only commit touching one HANDOFF file. Cite the code site above for the behaviour;
  cite the commit for the ruling.
- **S6 [OUR] ✅** **Section edits are always per-fe, one side.** The whole-chain and symmetric-mirror
  modes were excised from Section (they survive in Survey, for widths); fe resolution is by
  **nearest frontage polyline** (`nearestFeForSide`, `MeasureOverlay.jsx:288`), which is corner-safe
  where the old segment-ordinal projection misprojected an offset click across a bend.
- **S7 [OUR] ✅ ⭐** **`blockCustoms` crossing the Wall is AUTHORING, not a chain.** `sectionPass` is
  4-arg with `blockCustoms` (`tileGround.js:1863`) and `sectionOpen` takes it too (`:1908`); its only
  use is a dictionary lookup returning **scalars**, while every polygon still comes from the frozen
  artifact. A wall that blinded the open side to authoring would make every post-wall view render the
  un-authored to-code default — the wall erasing the product.
- **S8 [OUR] ✅** The frozen artifact carries **41 mouth patches across 20 tiles**. *Method: count
  `mouths[]` in `public/baked/lafayette-square/shape.json`.* Each one is a **real feature described
  by a patch** — `POLYGON-FIRST §2.1` Check 4's violation condition, by name.
- **S9 [OUR] ✅** **The mouth is a CO-CLAIM, not a gap** — two layers own the same ground; nothing is
  unclaimed. On `simpson-place`, sampling ±14 m at 0.25 m: **0 m² unclaimed**, **4.5 m² claimed by
  treelawn *and* sidewalk at once**. *Method: `node scratch/cap-mouth-classify.mjs`.* ⚠️ **I sampled
  ONE mouth** — the canon's *"~15 m²/mouth"* is a map-wide average I did not reproduce; treat the
  magnitude as 📄 and the *kind* (co-claim, not gap) as ✅. ⛔ Do not FILL-patch it.

---

## 5. The boundary between SHAPE and FILL

- **B1 [REQ] 📄 ⭐** **Freeze the silhouette; author the FILL live.** The heavy thing (the outline) is
  frozen so an override re-strokes only the interior. That responsiveness is the *reason* for the
  freeze, not a side effect.
- **B2 [OUR] ✅** **The CONSUMER side is closed.** `sectionOpen` composes block, curb, asphalt and the
  full ped FILL from `shape.json` alone — proven by running it: 99 block rings, 231 curb, 75 asphalt,
  266 sidewalk, all LU/treelawn classes non-empty, **no chain in lexical scope**. *Method:
  `node scratch/hadrian-wall-open-proof.mjs`.*
- **B3 [OUR] ✅ 🔴** **The PRODUCER side is open.** `shape.json` is minted by
  `buildTileGround(liveRibbons, …)` and snapshotted — a photograph of a chain-stroke, not a function
  of the frozen frame. **Check C is RED**; the chain-free `buildCurbRings` owns the offset path only.
- **B4 [OUR] ✅** **The committed `shape.json` is PRE-A07 — 101 tiles, `producer` stamp on ZERO of
  them.** *Method: key census over `public/baked/lafayette-square/shape.json` (1,055,013 bytes; 93
  tiles carry `iA`).* ⚠️ **So "which producer built this tile" is answerable from the CODE today and
  from the ARTIFACT only after a re-bake — and that re-bake is Jacob's call, not an agent's.**
- **B5 [REQ] 📄** **The layer test: "is this chains again?"** A wrong *silhouette* is upstream; how
  the *ribbon bends* is Section. ⭐ **On this chain the answer is upstream every time** — the
  unresponsive legs, the leg-flip and the mouth co-claim are all consumers rebuilding a polygon
  prebake never made (`ROADMAP A0`). ⛔ Do not re-key, re-fan or re-patch them in Section.

---

## 6. The cross-cutting requirements — carried forward, they govern everything above

- **R1 [REQ] ✅ ⭐⭐ THE OVERRIDE IS THE PRODUCT.** The machine pours a strong first draft; the
  operator may override any of it. An override is **first-class, never a defect to drive to zero.**
  - **R1a [REQ] ✅** Therefore **any measurement taken without the scene's authored state loaded is
    measuring the wrong map** — and it fails worst on the most heavily authored town while looking
    cleanest on a fresh pour. *(Honoured here: D5 is reported in both states.)*
- **R2 [REQ] 📄 EACH STAGE HANDS THE NEXT SOMETHING SIMPLER, AND EACH STAGE'S FAILURE IS
  UNRECOVERABLE DOWNSTREAM.** *"We'll fix it in the next stage"* is never available — which is
  exactly why D1 cannot be cured in Section.
- **R3 [REQ] ✅ ⛔ NO FALLBACKS.** A fallback converts a failure into a **plausible-looking success**,
  the worst outcome a kit can have. D4 is this shape inside the FILL: 37 tips *look* closed.
- **R4 [REQ] 📄 ⭐⭐ THE OPERATOR'S EYE IS THE GATE.** A count or a passing probe is **evidence, not a
  verdict.** The dead-end construction was green on every gate and judged worse on sight (D7). ⛔ **A
  claim in this file must therefore be about MECHANISM, never about a probe passing.**
- **R5 [REQ] ✅ THE DELIVERABLE IS THE CHECK** that catches the class in a town nobody has looked at.
  ⛔ Skip lists and exception tables are not results.
- **R6 [REQ] 📄 MINT IDENTITY ONCE, UPSTREAM; FREEZE IT; CARRY IT FORWARD; NEVER RE-DERIVE IT.** The
  face walk discards the node's stamp and the FILL re-guesses ownership — that is S8/S9's root.
- **R7 [REQ] 📄 ⭐ EVERYTHING IS A DERIVATION OF THE CENTRELINE, IN STRICT ORDER: centreline →
  polygon → ribbon.** ⛔ Diagnostic: if the polygon moves and the centreline does not, you are at the
  wrong layer.
- **R8 [REQ] 📄 CONSTRUCTION IS THE LAST RESORT, after the derivation is verified correct.** Twice a
  "hard polygon" dissolved once its *input* was fixed.

## 7. Ratified — locked, do not reopen *(the three that sit on this chain)*

- **L3 📄** The ped fill is a **mono-width concentric ribbon**; the corner is that band **BENT** around
  the arc — never a separately-constructed primitive. *(Live in code: C9.)*
- **L5 📄** Concentric offsets use **mitre** joins, never round — round joins re-round an already
  rounded ring and destroy operator-authored square corners.
- **L6 📄 ⭐** A **"loop street" is not a geometry concept** — it is an authoring-card name. ⛔ Do not
  build a loop primitive. *(Relevant here: `waverly-place-1` caps twice and is loop×loop — it is
  **not** this defect class, and the mouth fix will not touch it.)*

## 8. Known-open — stated so nobody reports them as discoveries

- **K1 ✅** The polygon does not close at any dead end — 50/50 tips are slits (D1). `ROADMAP A0`.
- **K2 ✅** 9 spurs have an unbounded leg at the mouth (C4). Same ticket, and it is the *minority*
  case: 41 of 50 are bounded.
- **K3 ✅** The producer side of the Wall is not chain-free (B3). `ROADMAP A03/A06`.
- **K4 ✅** The frozen artifact carries a mouth **patch** over a polygon that never closed (S8).
- **K5 📄** `ROADMAP A01` — the pipeline does not reproduce its own committed output (233 vs 228
  junction nodes). ⚠️ I confirmed the committed side only (`junctionMap.nodes = 233`); confirming the
  other half needs a re-derivation this brief forbids. **This is the highest-stakes open claim on the
  board and it is deliberately untestable inside these bounds.**
- **K6 📄** `ROADMAP A7` — some **real** corners are not getting the ADA regime. The inverse of the
  through-node false corner; same root question, corner identity.
- **K7 📄** `ROADMAP A8` — two sidewalk runs that come within proximity leave a thin treelawn sliver
  instead of joining. ⚠️ Layer unconfirmed (FILL join vs a curb-proximity SHAPE thing).

## 9. How to re-run everything above

All read-only. No pour, no bake, no dev server.

```
node scratch/coupler-slit-universal.mjs           # D1 D4 D5 — tips, displacement, mouth coverage
node scratch/coupler-slit-anatomy.mjs             # C3 C6   — the ring dump + Check 5 map-wide
node scratch/coupler-fe-coverage.mjs              # C7      — leg slots vs frontage edges
node scratch/claims-deadend-set-decomposition.mjs # C4 C5 D5 — the three sets + dual-state
node scratch/hadrian-wall-open-proof.mjs          # B2      — sectionOpen off the frozen artifact
node scratch/cap-mouth-classify.mjs [skelId]      # S9      — per-mouth layer ownership
```

⛔ **Do not re-copy the `coupler-*.mjs` originals from the `polygon-asks-stamp` branch.** They read
Slice-1 fields that do not exist on trunk and print a silent `0 slits`, which reads as *"no defect."*
The trunk ports derive every fold from the frozen artifact alone.

Artifact key-censuses (C8, C11, S4, B4, D3) are one-liners over `src/data/ribbons.json` and
`public/baked/lafayette-square/shape.json`; each claim states its exact field and predicate.

---

*Written 2026-08-05 by Quill, fresh, from the Tier-2-corrected corpus on disk — `ORIENTATION` ·
`README §START HERE` · `POLYGON-FIRST §2.1/§2/§5` · `SECTION §3/§4/§5/§6/§7` · `RIBBONS §1/§4/§6.4` ·
`SURVEY §3/§4/§5/§6` · `PREBAKE §4/§4.1` · `WALL §2` · `PIPELINE §Wall` · `ROADMAP A0/A01/A03/A06/A07/A7/A8` ·
`scratch/doc-sweep-tier-2-report.md`. The frozen whole-pipeline baseline it replaces:
`cartograph/_archive/PIPELINE-CLAIMS-full-manifest-2026-08-02.md` (⛔ drift-diff only, never cited as true).*
