# BRIEF — slice 2: give the walk the geometry it was designed for

**Status: OPEN, undispatched. Written 2026-08-21.** ⛔ **Nothing here is a conclusion of the author's
reasoning. Every line carries a receipt — a commit, a `file:line`, or a command. If a claim has no
receipt, it is not in this document.** *(Written this way deliberately: on 2026-08-21 the coordinator
was wrong six times in one session and every correction came from reading the repo. Do not trust a
framing — including this one. Re-run the commands.)*

---

## 0. THE GOAL THIS SERVES — say it before you start

**One continuous sidewalk band around the perimeter of every street, with end caps and corner
treatments working, derived geometrically, no guessing.** *(Jacob, 2026-08-21.)*
⭐ Swapping a sidewalk for land-use is an **operator gesture with no structural consequence**. If a
proposal makes a material choice change the geometry, it is wrong.

## 1. ESTABLISHED — the band's rim holes, root cause

▶ `node scratch/claims-nodeless-tip-classifier.mjs --source=pour`
▶ `node scratch/claims-preclip-walk.mjs`
**Home: `cartograph/PREBAKE.md §2.5a`.** Commits `6d2fcb4d` · `846c9535` · `566dff4c` · `fc9e881d`.

- `pipeline.js:111` `deriveLayers` builds `junctionMap` over **full-length chains**. The clip runs
  after, and `clipRun` **mints new endpoint coordinates**. The category filter is
  `if (Array.isArray(arr))`; `junctionMap` is an **object** ⇒ **skipped, never re-derived.**
- **A frozen index outlives a mutation of the geometry it indexes.** No refusal, no re-derive.
- **Nodeless degree-1 tips: 25/25 LS · 67/67 HPDM within 0.5 m of `keepR`. Zero unexplained.**
  ⛔ **No node source declined them — at derive time the vertices did not exist.** Every source is
  correct. **There is no coverage gap in `junctionMap`.**
- Downstream: no node ⇒ no `cornersAdjacent` (the emitter iterates `jnodes.values()`) ⇒
  `substrateWalk` `no-successor`/`no-node` ⇒ **the run does not close** ⇒ **a hole in the ped band.**
- **`no-node` is 100% the clip on both towns — 0 elsewhere.**
- Reciprocal: nodes beyond `keepR` — **LS 48/305 · HPDM 2006/2457 (82%)**.

## 2. ESTABLISHED — the walk is CORRECT, and it is fed the wrong geometry

- `substrateWalk` is a **textbook planar-face traversal**: `cornersAdjacent` is the frozen clockwise
  rotational order at each node; the walk resolves each adjacent pair to inbound/outbound half-edges
  and follows successors. **Identity is emitted, never recovered** — each ring vertex is pushed by the
  half-edge that owns it. Failures are **loud and attributed**; *"the walk still does not repair."*
  ⛔ **Its `coupler` vocabulary is ROT. Do NOT condemn it by its names** — a word census nearly got
  working code rewritten (2026-08-21).
- **The only production call site is `tileGround.js:1107`**, and it passes
  `{ streets, junctionMap, widthAt, orientation }` — **no `outerRing`.**
- `streets` traces to `ribbons`, which every artifact writes **after** the clip. Measured: **0 of 152 LS
  / 278 HPDM chains carry a vertex beyond `keepR`** ⇒ post-clip, confirmed.
- **Pre-clip geometry is NOT reachable at walk time.** `clean/skeleton.json` is cartograph-side and
  absent from the bundle. Full-graph input must be **carried through the freeze deliberately.**

## 3. ESTABLISHED — "build full, crop last" is ASPIRATION for the walk

- Stated as doctrine at **`derive.js:4746`**. **Implemented for `extractFaces` only** (`:4795` local
  `clipStreet`, `:4807` ring injection, `:4817` cap freeze against `ribbonsLayer.streets`). That block
  never assigns `ribbonsLayer.streets` and never mutates `.points` — **disjoint outputs.**
- **The walk gets neither half:** cropped input, and `outerRing` (documented as *"the stencil, AS AN
  ARGUMENT"*) defaults to `null` and is never passed.
- ⛔ Not ROT (true of `extractFaces`), not a REGRESSION (the walk never had it). **ASPIRATION — an
  unbuilt thing filed as done.** `CLAUDE.md`'s third mismatch cause.

## 4. RULED ALREADY — do not re-open these

- **`blocks = boundary − stroked roads, WALKED over identity-carrying directed side-chains.**
  `RIBBONS §1`. **The walk and the stencil are ONE model, not two options.**
- ⛔⛔ **THE RIM BOUNDS, IT DOES NOT OWN.** Jacob retracted *"the radius is an ordinary chain"* on
  **2026-08-12**: *"I was wrong; the radius is not an ordinary chain."* It is **NOT a side-chain — no
  coupler, no `baseMeasure`, no band, no ADA, no corner rule.**
  ⇒ **The rim will NEVER supply junction nodes.** ⛔ Do not expect the nodeless-tip class to close as a
  side effect of the boundary becoming a participant. *(A stale pre-retraction sentence in `PREBAKE
  §2.5a` misled two readers on 2026-08-21; evicted in `565c4bd9`.)*
- **A walk does not close the perimeter** — unclipped, of tiles carrying a `__boundary__` edge, those
  closing on real streets alone: **LS 14/31 · HPDM 25/53** (`RIBBONS §1`, Tessel). ⭐ **EXPECTED, not a
  failure — the stencil closes those.** ⛔ Do not report it as a defect. **Every** interior tile lands
  inside a bounded face on all six scenes — that control is what makes the instrument trustworthy.
- ⛔ **MOVING THE CLIP BEFORE DERIVE IS DISQUALIFIED.** `keepR` reads `streetFade`, a **render
  parameter** (`PREBAKE §2.5`). It would let a look setting decide `roadId` unions and reconciled
  widths. Measured cost on HPDM: 7 road components lose a member, 6 corridor unions lost, 6 divided
  pairs truncated (LS: 0/0/1 — ⭐ **the mould would have reported "no dependency"**).

## 5. THE TWO UNKNOWNS — this is what the work must establish FIRST

1. **Does the stencil-crop exist as an OPERATION, or only as a LABEL?** `outerRing` is documented as
   *"used only to classify which faces are perimeter; never reached for, never painted."* **Classify,
   not close.** If the punch-out's boolean subtract already exists and the walk's faces can be fed to
   it, this is **wiring**. If the walk's open rim runs must be *closed against* the stencil and nothing
   does that today, it is a **build**. ⇒ **`RIBBONS §1` gate 1 case C measured the PUNCH-OUT (93
   islands ↔ 101 tiles, clean injection). The walk is what `tileGround` runs. Establish whether they
   are the same operation or two.**
2. **What does carrying pre-clip geometry through the freeze cost?** Bundle size, and a decision about
   what ships. `promote-ribbons.js` will refuse any promote whose counts move — expect it.

⛔ **Answer both before writing cure code. If either says "build, not wiring," STOP AND REPORT** —
scope changes the ruling.

## 6. THE GATE

```
nodeless / no-node        LS 25 → 0      HPDM 67 → 0        the fix
interior tile coverage    LS 43/70       HPDM 107/143       ⛔ MUST NOT REGRESS
rim tile coverage         LS  9/31       HPDM  12/53        report SEPARATELY, never summed
frame origin              byte-identical across a pour      node scratch/claims-building-identity-survives-repour.mjs
case C                    93 islands ↔ 101 tiles, 0 splits  node scratch/reconcile-punchout-vs-faces.mjs
```
⛔ **The interior number is NOT closed and the clip does not move it.** 27 unclosed interior tiles on LS
are **slice 2's own open state**. ⛔ **Do not let this work read as explaining them.**
⚠️ `reconcile-punchout-vs-faces.mjs §17` prints BASELINE DRIFT since `df01dd34` (the promote) — expected,
the input moved on purpose. ⛔ **Do not bump the expectation to make it pass.** Re-baseline deliberately
once `design.json` settles.

## 7. TRAPS, EACH ONE PAID FOR

- ⛔ **`_substrate-feed.mjs` defaults a non-LS scene to `clean/ribbons.json`** — on HPDM that is the
  **pre-mint bundle** (2015 nodes, 0 pendant-tip, `via:'cap'` 0). It produced 62 phantom failures before
  a guard caught it. **Live for every slice-2 probe that imports the feed. Own ticket.**
- ⛔ **Name the artifact on every number: pre-clip · post-clip · pre-mint · post-mint · consulted-set ·
  rim · interior are seven different populations.** Merging them has caused three wrong findings.
- ⛔ **A doc is not a source.** `PREBAKE §2.5a` was wrong for nine days. Route, then test the doc
  against the code, and say which of ROT / REGRESSION / ASPIRATION.
- ⛔ **A difference is not a defect.** Ask what the map looks like if the code is RIGHT first.
- ⛔ **The eye is the gate, and it may see nothing** — `dolman-street-1`, `west-18th-street` and
  `saint-vincent-avenue-2` are **authored**; `readFeCustom` wins over the chain measure
  (`SurveyorOverlay.jsx:223`). A default-layer fix is **invisible on LS by construction** and is what
  town #2 gets without hand-work.

## 8. NOT THIS TICKET — do not let these in

`A7`'s five-predicate corner flag (`tileGround.js:1996`) · the `feCustomKey` re-key · the `fe↔span`
credit defect in `assignSegOrdsToFes` (`buildBlockGeometryV2.js:1026`; LS 0/3 · HPDM 5/8) · `A06`'s 42
carve tiles (120 of LS's 163 declined corners). **All real, all separate, none of them close the band.**

⚠️ **Filed, not fixed:** `derive.js:4575`'s tip-no-node log names *"Source 6's `|L−R| >= 0.5 m`
width-step gate"* as the cause — a gate `9f53ef39` **removed**. Silent today (count 0); prints a false
cause the day it fires.
