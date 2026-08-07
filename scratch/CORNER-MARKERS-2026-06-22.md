# Corner markers — Jacob's 23 circled dysfunctional corners (2026-06-22)

Source: `cartograph/data/lafayette-square/clean/marker_strokes.json` (freehand circles, eye-derived). Centers matched to nearest streets + classified by junction topology (probe agent, frozen `skeleton.json`/`shape.json`). **This is the corner-correctness worklist for the front AFTER the dead-end mouth wrap (which is LANDED for its own subset, `DEAD-END-MOUTH-FORENSIC.md`).**

## Classification (the key result: NOT one family)
- **Through-T (no deg-1 tip) — ≈1:** Kennett Place × S-18th (#3 [376,158], #4 [391,161]). NOT a dead-end (T's into a cross-street at both ends). The dead-end lever does NOT apply (no zero-width collapse; corner already has two real legs). Own cause — probe: §5b divided-Y adjacency, or a normal-corner FILL/`isNameTransition` mis-key, or a width-step.
- **Dead-end-domain stragglers (in `deadEndSkels`, but the circled MOUTH reads as a normal two-corner mouth, not the collapse) — ≈4:** Vail Place × Park (#19 [328,-112], #20 [346,-105]); Hickory × Mackay Place (#22 [27,-401]); Mississippi × Lasalle (#16 [319,-431]). If still butt-capping → a normal-corner FILL gap, NOT the spur collapse. (Note Benton Place × Park #2 [48,-202] = a LOOP body, deliberately excluded from the spur gate.)
- **Complex / divided junctions (the BULK ≈12–14) — `SKELETON §5b/§5e` family, a separate campaign:**
  - Mississippi × Lafayette 4-way: #8 [151,205], #9 [176,208], #10 [179,234], #11 [156,231].
  - Park / Mississippi / Rutger / Mississippi-Alley cluster (deg-4/5): #0 [244,-261], #1 [231,-212], #12 [220,-173], #13 [247,-169], #14 [235,-144], #15 [210,-147].
  - Carroll × Dolman (deg-4): #5 [485,124], #6 [501,126], #7 [505,107].
  - S-18th × Park — degree-5 divided-"Y" node: #21 [416,-79].
  - Dillon × Carroll: #17 [704,142], #18 [702,156].

## ⭐ HOTSHOT DIAGNOSIS (2026-06-22, opus) — the operator's "default isn't a good default" is BORNE OUT
**Decisive cross-cutting finding: the curb (iA) is CLEAN everywhere checked** (0 self-int, uniform fillets) — the §5b/§5e "32 m spike / false corner from carriageway stubs" the canon describes is **GONE** (cleaned since that diagnosis). So the remaining dysfunction is **FILL-layer (how the ped band wraps a clean curb) + DEFAULT-FILL (wrong TL/SW), NOT curb construction.**

**The default-fill root (sharper than a threshold):** `gleanTreelawn` (`tileGround.js:754`) reads each side's surveyed gap; the problem is weak per-side survey provenance — **14 `sidewalk-1side` streets** (measured one side; other inferred → mis-gleans: Kennett, Dillon, Park Place, West-18th) + **4 `assessor` ROW-only streets** (no sidewalk measure → silent N: Benton, Dillon, Hickory, Rutger). **35% of two-sided streets glean a different Y/N L vs R** → treelawn flips mid-block → reads as broken corners (`_archive/SECTION-fill-tail-2026-08-07.md` §1, mechanism 2 — where the 35% figure is also superseded).

**The 23, classified:**
- **(a) default-fill artifact ~13:** #2-7, #17-20, #22, partial #12-15 — wrong TL/SW, not mis-built.
- **(b) divided-median FILL (mild, not curb spikes) ~4:** #9-11 (Miss×Laf median), #21 (Park×S18 median) — tiny fillets on median tiles; FILL-side, bounded, like the mouth-wrap lever.
- **(c) likely FINE ~6:** #0,#1,#8,#16 — legs glean N=N symmetric; corner already reflects reality. "Move on" candidates.

## ✅ STEP 1 LANDED (committed `302de36b`, PENDING EYE-GATE) — per-street default glean
`gleanTreelawn` now per-street-aware: an inferred placeholder side (`terminal:'lawn'`) **inherits the measured side's Y/N** (not the bad inferred-N). **6 sides flipped N→Y:** dillon, grattan, henrietta, soulard, s-13th, s-21st. iA byte-identical, FILL-only, customs merge over unchanged. Direct circle hit: **#17/#18 (Dillon×Carroll)**.
**▶ VALLEY CASES — the operator's eye-call (data can't decide, 0.25–0.75 m gap; NOT auto-flipped):** Carroll(0.48 both), Mackay(0.29), Vail(0.63), St-Vincent-Ct(0.30), Nicholson(0.57), Simpson(0.30–0.55), + Allen/California/Chouteau/Geyer/Henrietta/McNair/Montrose/S-Ewing. Plus **Hickory** (assessor, reads N — likely should be Y). The operator must call these (he knows the real arrangement) → bake into the default so reset-to-default = reality. (Authoring tools are DOWN, so encode his calls directly for now.)

## ⛔ THE REAL OPEN ISSUE (operator-corrected 2026-06-22 EOD — START HERE, next Boz)
- ✅ **Kennett's intersection + corners are FINE** (operator confirmed). The earlier "Kennett wrong both sides" and "through-T corner" framings were BOTH wrong — drop them. The curb/corner construction at the complex/divided junctions is NOT the problem (the hotshot confirmed iA is clean everywhere; the §5e spike era is over).
- ⛔ **THE problem: the default TL/SW⟷SW arrangement "did nothing."** Step 1 (commit `302de36b`, the per-street glean) was supposed to make the default reflect the real treelawn/sidewalk arrangement — the operator's core want ("reset-to-default should give the real situation"). On his eye it **did nothing**. It was too conservative: it only flipped **6 inferred-sides** and **surfaced** (did not apply) the valley/asymmetric cases — so the bulk of the map's default is unchanged, and it doesn't deliver the real arrangement. **Also reported: "only one side's swap features are working"** — the default/swap only partially applies per side. ▶ **The next task = actually make the default reflect reality:** resolve the valley cases (operator's per-street calls — he knows the real ground), fix the per-side application (the one-side-only behavior), and verify it RENDERS (could also be a stale-bake — confirm Section reloads the fresh shape.json before assuming it's the rule). This is THE lever for ~13 of the 23 circled corners; the curb is already clean, so it's pure default-fill/FILL, not construction.

## Routing note
The dead-end mouth wrap (FILL-side lever, `opts.deadEndMouthWrap`) is LANDED + eye-confirmed for true dead-end spurs (Albion/Whittemore + the 39). It does NOT address these 23 — they are through-T / normal-corner / divided-junction corners. The bulk is the **divided & deg-4/5 junction corner** problem (`SKELETON §5b/§5e`, `HANDOFF-junction-construction.md`). Next step when this campaign opens: probe one complex cluster (e.g. Mississippi×Lafayette or the Park/Mississippi/Alley cluster) and route by §5b/§5e. ⛔ **The eye is the only gate** (every proxy lied this session). Coords above = world XZ; match to streets, not tile numbers (the operator can't navigate tile numbers).
