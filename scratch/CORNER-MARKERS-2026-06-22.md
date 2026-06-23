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

## Routing note
The dead-end mouth wrap (FILL-side lever, `opts.deadEndMouthWrap`) is LANDED + eye-confirmed for true dead-end spurs (Albion/Whittemore + the 39). It does NOT address these 23 — they are through-T / normal-corner / divided-junction corners. The bulk is the **divided & deg-4/5 junction corner** problem (`SKELETON §5b/§5e`, `HANDOFF-junction-construction.md`). Next step when this campaign opens: probe one complex cluster (e.g. Mississippi×Lafayette or the Park/Mississippi/Alley cluster) and route by §5b/§5e. ⛔ **The eye is the only gate** (every proxy lied this session). Coords above = world XZ; match to streets, not tile numbers (the operator can't navigate tile numbers).
