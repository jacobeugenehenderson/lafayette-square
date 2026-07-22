# BRIEF — the dead-end MOUTH (where the spur meets the through road)

**Status:** DRAFT, dispatch-ready. Active brief (tracked at root). Written 2026-07-22 from a live
eye-session with Jacob on the Lafayette Avenue strip (Missouri · Simpson · Waverly · Nicholson
Places). Continues the dead-end class: `BRIEF-dead-end-leg-flip-and-slope.md` (the TIP end —
**LANDED**, see §1) closed the cap; this is the **other end of the same finger**.

> ⛔ **ROUTE FIRST (`CLAUDE.md` gate):** `ORIENTATION.md` → `README §⭐ START HERE` → then
> **`RIBBONS.md §1`** (the derivation chain + the CONSTRUCT-the-hard-polygons doctrine) +
> **`SECTION.md §6`** (the corner construction) + **`THROAT-JUNCTION-FINDINGS.md`** (the detector
> invariant that measures this class). Memory: `[[project_dead_end_cap_is_an_end_coupler]]`,
> `[[feedback_shape_pass_fix_needs_rebake_before_the_eye]]`,
> `[[feedback_geometry_bugs_may_be_data_bugs]]`, `[[project_the_palimpsest_code_path_multiplicity]]`.

---

## 0. The one-line conclusion

**A dead-end spur T'ing into a through road collapses to a ZERO-WIDTH SLIT in the face walk, and
everything at that mouth is a patch reconciling two things that were never derived to meet.** The
corner construction itself is sound; the *inputs* to it don't line up. This is the
junction-construction class (`RIBBONS §1` doctrine), **not** a FILL defect.

> ⛔ **Do NOT fix this in the FILL.** `README §START HERE` on the through-node break: *"the
> through-node break is NOT a FILL patch (that class was tried + reverted —
> `THROAT-JUNCTION-FINDINGS.md`)."* Four separate FILL patches already sit on top of this collapse
> (`mouths` disc, through-road pullback, corner-leg synthesis, cap-segOrd identity). A fifth is the
> wrong move.

---

## 1. What LANDED first (2026-07-22) — the TIP end of the finger

All eye-gated or measured; **UNCOMMITTED** on `curb-offset-draw` at time of writing. Four defects,
each fixed **at its source**, which is why they came out clean:

| # | Defect | Root | Where |
|---|---|---|---|
| 1 | Flipped cap notched at both shoulders | The bend transition was **hard-coded** to one arrangement (walk-outer-at-cap → walk-inner-at-leg) — correct only for a treelawn-Y leg, painted backwards for a walk-at-curb one, so it disagreed with the bulb AND the leg | `tileGround.js` cap coupler |
| 2 | A dead-end LEG flip rendered Δ=0.0 | (a) the ribbon **folds on itself** at a dead end, so v2 emitted ONE fe under ONE side token and the returning leg had no slot; (b) both legs are the same centreline, and the claim was a **symmetric** `strokeOpen`, so one leg's group swallowed the whole finger | `buildBlockGeometryV2.js` fold chop + `tileGround.js` per-side claim |
| 3 | Asymmetric roads drew symmetric | `tileGround.js:3216` wrote each edge's depth under **both** directed keys; on a zero-width slit the ring traverses the same edge twice, so the second leg **clobbered** the first. **22 of 48** dead-end chains drew at one side's width | `tileGround.js` directed keys |
| 4 | Survey "Asymmetric" toggle wouldn't stick | `selectStreet` re-seeded `editSidesSeparately` on **every re-click of the same street** — and that click is what places the drag anchor | `useCartographStore.js` |

**Measured:** dead-end legs responding to the authoring controls **56 → 93 of 100**; unreachable
leg slots **43 → 7**; caps with both sides addressable **16 → 42**; cap sweep 46 caps **0 errors**;
**all 54 authored slots in `design.json` intact** (none lost or re-keyed). `shape.json` re-baked;
Nicholson eye-confirmed by Jacob.

⚠️ **Known-changed, needs the eye:** 10 asymmetric caps now render **each leg's own** surveyed
arrangement instead of one overwriting the other. Truthful, but visible. Jacob's call.

⚠️ **Still open from that pass:** 7 legs don't respond (`whittemore-place|right`,
`rutger-street-0|right`, `st-vincent-court-1|left`, plus 4 where `assignSegOrdsToFes` hands the
terminal segment to a longer neighbouring fe); 7 caps flip to no visible change (**pre-existing**,
identical before that work, undiagnosed).

---

## 2. The MOUTH defect — what it looks like

At every dead-end mouth on the Lafayette strip: the through street's band ends in a **squared bite**
short of the corner, sometimes stranding an isolated fragment of the other material in the middle of
the pad. Jacob: *"All of the corners and sw <> TL config is busted this whole strip."*

Eye-proof: `scratch/cap-viz-P-simpson-mouth.png`, `scratch/cap-viz-Q-nicholson-mouth.png`
(both render the LIVE path — reproduce with `node scratch/cap-viz.mjs simpson-place:end noflip 22 "" at=-147,172`).

---

## 3. What the measurements SAY (don't re-derive these)

### 3.1 ⭐ The reconciliation gap — the mouth's two numbers don't meet

At Simpson (`scratch/cap-mouth-probe.mjs`):

```
mouth mid = [-147.0, 172.4]     mouth trim R = 10.847 m
apexA [-144.3,180.8]  fillet r=4.50   tangents from the mouth node: 12.99 / 11.55 m
apexB [-152.2,179.6]  fillet r=4.50   tangents from the mouth node: 11.60 / 13.04 m
```

The `[DEAD-END MOUTH WRAP]` block pulls the **through road's run back by `m.R` = 10.85 m**
(`tileGround.js` ~:1235, `t0 = Math.max(t0, m.R)`) so its wide leg-sector stops short of the spur's
corner wedge. But the corner pad's sector only starts at the **fillet tangents, 11.55–13.04 m** out,
extended up each leg by `c.trim`. **The band between 10.85 and ~11.6–13.0 is claimed by neither** —
it floods to `luRemainder`. That is the squared bite, and it is the same gap at all four Places
because they all T into Lafayette the same way.

### 3.2 The skeleton at these T's is CLEAN — this is not a frame defect

`lafayette-avenue-3` (which Missouri · Simpson · Waverly · Nicholson all T into):

```
8 vertices; deflections 0.0°–0.2° across the whole chain; segments 17–106 m
Simpson  mouth = its INTERIOR vertex 3/7
Nicholson mouth = its INTERIOR vertex 6/7
```

Dead straight, and **both spurs meet it at proper interior vertices** — real deg-3 nodes, correct
real-world topology. `RIBBONS §1` diagnostic step 1 comes back clean: re-tracing the skeleton here
changes nothing. **The defect is in the junction DERIVATION, not the traced lines.** (Say this out
loud before anyone proposes a frame edit — `[[feedback_survey_chains_immutable_corner_is_stroke]]`.)

### 3.3 The class is PERVASIVE — 61 of 152 junctions

`scratch/correctness-detector.mjs` invariant #8 (junction-band), unchanged, on the current build:

```
152 junctions (deg>=3): 82 CLEAN (0 throat slivers), 61 FLAGGED (>=2 slivers <8 m2)
Worst: (-37,261)   d3  slivers=28  {Waverly Place}
       (-54,259)   d3  slivers=27  {Waverly Place}
       (-686,-211) d3  slivers=20  {St. Vincent Court}
       (-671,-209) d3  slivers=20  {St. Vincent Court}
       (-443,-656) d4  slivers=11  {Lasalle / Ohio}
       (668,-205)  d3  slivers=10  {Hickory Lane / Grattan}
```

The worst offenders are the **same family** — dead-end Places and Courts T'ing into a through
street. This strip is not two broken corners; it is a 61-junction class. **Reuse this detector as
the gate — do not build another harness.**

### 3.4 Hypotheses already REFUTED (don't re-walk them)

| Hypothesis | Verdict |
|---|---|
| The through-node gate mis-keys and mis-fires here | **Dead.** `thruNodeEnds` carries **0 markers across all 101 tiles** — the 2026-07-16 cure isn't in the artifact at all. It is entirely inert, map-wide. |
| `isThrough` can't fire, so the through road bids a false corner | **Dead.** Both through run-ends are `lafayette-avenue-3\|right` in ONE tile (#11), so `isThrough` DOES fire and the through road is correctly suppressed. |
| The mouth's corner-leg synthesis misses, so Idea-A never runs | **Dead.** `scratch/cap-mouthleg-probe.mjs`: **41 mouths, 0 apex corners** where the through leg isn't found. Every mouth corner gets its two legs. |
| The corner arithmetic is pathological on this strip | **No.** Resolved: Lafayette `conD = total = 3.00`, Place `conD = o = 1.50`, `cMin = 1.50`, `rampLen = 3.0 m`. Modest and correct. |
| The gleaner throws away the Places' treelawn (valley 0.15–0.57 vs threshold 0.6) | **Misframed.** Jacob: *"If there is no treelawn, we still make the ribbon with 2 parallel strips that can swap. SW only is already a configuration; SW into SW <> TL is **also** a configuration."* Widths resolve to 1.5/1.5 either way — treelawn Y/N picks which slot is OUTER, nothing more (`SECTION §3.1`, the mono-width strip swap). So a mixed corner here is a legitimate **arrangement DIFFERENCE**, which the governing rule says gets the slope. |

---

## 4. The fix DIRECTION (not yet attempted)

`RIBBONS §1` doctrine, in order of preference:

1. **Fix the DERIVATION first — construction is the last resort.** The 2026-06-15 update is
   explicit, and it now has a third confirming instance: the junction-curb bump dissolved by
   correcting the *survey*; the median dissolved by correcting the *widths*; and defect #3 above
   (2026-07-22) dissolved by correcting the *edge keys*. In all three the artifact came out right
   once the derivation did. **Ask what the mouth's derivation gets wrong before constructing
   anything.** The specific question: why does the face walk produce a zero-width slit for the spur
   at all, and can the mouth be derived with width — as the ordinary block-face walk already does
   everywhere else?
2. **If it genuinely cannot be derived — construct the junction polygon positively at the node**
   (the intersection-everywhere campaign; `HANDOFF-junction-construction.md`;
   `OSM2STREETS-GROUNDING §4` recommendation #2). Trim the roads back, replace the node
   neighbourhood by construction. *"Every E3 artifact lives in this gap."*
3. ⛔ **Never** patch the reconciliation gap in §3.1 by nudging `m.R` or the sector margin to meet.
   That is editing a shadow, and it is the move that was already tried and reverted.

---

## 5. Verify tooling (all in `scratch/`, git-tracked — REUSE, don't rebuild)

| Tool | What it answers |
|---|---|
| `correctness-detector.mjs` | invariant #8 junction-band — **the gate** for this class, per-junction sliver counts |
| `cap-mouth-probe.mjs <skelId>` | the mouth's trim R vs the fillet tangents (the §3.1 gap) |
| `cap-mouthleg-probe.mjs` | do mouth corners get their synthesised second leg? |
| `cap-viz.mjs <skelId:capEnd> [flip\|noflip] [R] [leg=side:segOrd] [at=x,z]` | renders the FILL to SVG→PNG; `at=` re-centres on the mouth |
| `cap-authoring-roundtrip.mjs` | end-to-end: does a click on a dead-end leg reach the slot the render reads? |
| `cap-leg-slot-parity.mjs` · `cap-fe-key-diff.mjs` | fe-slot reachability; authored-custom orphan check |
| `cap-frozen-vs-live.mjs <skelId>` | ⭐ frozen `shape.json` vs live — **run this before diagnosing "the fix didn't take"** |
| `cap-fill-hash.mjs [plain\|design]` | whole-map FILL fingerprint for byte-parity before/after |
| `cap-asym-census.mjs` · `cap-sweep.mjs` · `cap-fe-wrap-census.mjs` | asymmetric caps · map-wide cap flip sweep · fold census |

⚠️ **`shape.json` is FROZEN.** Section/Measure read the artifact, not a live build. A shape-pass fix
is invisible in the app until `node scratch/rebake-shape.mjs`. A harness renders LIVE; the
operator's eye sees FROZEN — "works in the probe, not on the eye" is a stale-artifact hypothesis
before it is a wrong-fix hypothesis.

---

## 6. Acceptance (the eye is the gate)

1. The through street's band runs **unbroken** past a dead-end mouth — no squared bite, no stranded
   fragment — at Simpson, Nicholson, Missouri and Waverly, on the FROZEN render, then Jacob's eye.
2. `correctness-detector.mjs` junction-band: the 61 flagged junctions **drop materially**, and no
   currently-clean junction regresses (82 clean is the floor).
3. Non-mouth junctions **byte-identical** (`cap-fill-hash.mjs`).
4. Authored customs intact (`cap-fe-key-diff.mjs` — 54 slots, zero lost or re-keyed).
5. Validate the whole class (41 mouths), not just this strip.

## 7. Notes

- Jacob, on layer: *"I don't know if this is a ribbon issue or a skeleton one... it seems like we
  have to fix the skeleton before we work on the ribbons."* The measurements in §3.2 refine that —
  the traced **lines** are clean; the **junction derivation** is what owes work. Both are upstream
  of the FILL, so the instinct to stop patching downstream was right.
- Waverly Place is both the **worst-fragmented junction** (28 slivers) and the site of the Survey
  mirror complaint (defect #4). Suggestive, not established.
- The dead-end family now has FIVE identified members: cap slope · leg flip · width collapse ·
  Survey mirror (all landed) · **the mouth (this brief)**.
