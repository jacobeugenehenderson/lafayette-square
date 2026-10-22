# BRIEF — the rim is cut once: no sub-lattice slivers where the drawing meets the disc

<!-- BRIEF-STATE
status: OPEN
dispatched: Mitre (WARM), Boz overnight 2026-10-21 under Jacob's standing rule (a stopper convenes Zob + the specialist; keep going)
written: 2026-10-21
evict-when: HPDM's rim residue (B1 + B2) and LS's asphalt needle are gone at the source, the mutants below each go RED, the build is merged to integration; then this moves to cartograph/_archive/ dated.
-->

**Premise pass: Zob, on db33055c; corrections folded in.** **Agent: WARM → Mitre.** **Report to Boz.** **Instruction: confirm-then-build.** Premises are Zob's and Mitre's
measurements (2026-10-21 night); check each against the code and say what you found. If the code contradicts this
brief, stop and flag Boz.

## 0. Why

After the flatten noding and the height-code fixes, HPDM's ground bake still refuses on unowned ped vertices AT THE RIM.
Two mechanisms, both lattice rounding meeting the disc (Zob, measured; scripts in Zob's session scratchpad `rim/`):

- **(A) a crossing minted PAST the rim on ONE operand's copy of a shared line** (HPDM's B2: 261 points, 247 in tile 242).
  In `sectionPassProtoTile`, the lawn's operand (`less(env − Wp)`, env = band(pedOuter, luIn0) ∪ envX) carries a vertex
  262.9 m along a line it shares with the curb's operand (`less(band(curbOuter, pedOuter))`), past the rim crossing at
  ~199 m. Rounding that vertex to the lattice tilts the lawn's copy 0.416 mm. The oblique block cut (`inBlock` =
  `intersectRings(rings, st.iA)`) then crosses the two copies 0.6 mm apart, which rounding takes to a 1.41 mm pair.
  Inside the disc the copies stay within the flatten noding's √2/2 bound. Only the oblique cut magnifies them past it.
- **(B) a rounded crossing ON the rim chord, not shared with the stencil the deformer reads** (HPDM's B1: 341 points 0–2 m
  inside the disc; Huron 15; LS 3; the split between B1's kinds is measured on one point of each only). All 256 vertices of
  `MP.boundaryRing` are on the lattice, so the painted rim runs exactly along the chord, EXCEPT at crossings minted on it
  (band lines × iA's rim edge in `inBlock`; iaFull × disc in `cut(t.iA)`), each rounded up to √2/2 step off the chord
  (Zob, measured). The deformer's 'beyond' test reads the exact chord (`stencil.clipPolygon`), so between the chord and a
  paint edge tilted toward a rounded crossing lies a thin lot wedge; its ray, 65° off the normal (station (1354.904,
  308.036), direction (−0.60868, 0.79341)), reads ~1.1 mm of lot and `bandsAlong` returns before the band.
- **(C) related, separate site:** LS's asphalt needle (Plumb): the disc stamp in the sectionOpen finish (`cut`/`cutOwned`
  → `intersectRings(…, [MP.boundaryRing])`) mints a crossing 0.166 mm off the rim chord that the tile ring doesn't share.

## 1. The fix, at the source (⛔ never a deformer tolerance, never a wider window)

**Boz's call (overnight, under ruled doctrine; flagged to Jacob): (A) + (B via route ii) + (C via route i on the ring).**
1. **(A): move `inBlock` (∩ `st.iA`, never the disc) onto each PAINT operand before the band differences**, at its
   producer sites: (1) `insDL`'s return (pedOuter, luIn0, LV_wf/LV_wt → W) · (2) `ins` · (3) `curbOuter` · (4) `legExt`
   (walkX, envX0, walkCut) · (5) perpPieces / ramps / R.masks / roadBand. Leave the labelled level rings (LV_*) that
   bandPiecesOfTile's cells read uncut: the pieces cut the painted band, so they follow the paint (Mitre; confirm).
   ⛔ Never cut `parts` (iaFull) by the disc before the offsets: that bends the bands around the rim, which the design
   forbids. ⛔ A disc cut added at the END doesn't close it, and a wider snap across classes is a tolerance.
   Measure whether two independently offset copies still arrive with different crossings at the rim; say so if any remain.
2. **(B), route (ii): the deformer's 'beyond' test reads the DRAWN block's rim** (the cut iA, which carries the rounded
   crossings), not `stencil.clipPolygon`. "The rim is an edge of the drawing" (`ORIENTATION`, the compound shape): the
   drawing decides. ⛔ A lattice point can't lie on a general chord, so "snap the paint onto the stencil" isn't buildable.
   If (ii) touches the fade, the ink clip or membership, stop and say which.
   **STATUS 2026-10-21 morning (Mitre, measured at integration ba02b826): route (ii) is BUILT (the deformer reads the
   painter's noded rim, 4be86489) and B1's gate is STILL OPEN.** The point (1352.96, 310.57) is unowned. Its ray reads beyond →
   1.56 mm of lot → lawn, across a wedge between lawn #430's edge and the noded rim edge (1354.413, 307.852) →
   (1354.072, 309.290). The paint's rim edges and the noded rim ring are two rounded copies of one line, 0.34–1.35 mm
   apart: HPDM's class 3 (53 points, tiles 134/55) and 43 m of LS rim-side kerb stretches. **B1's source fix (Boz):** the
   paint's rim edges take the rim ring's OWN vertices, from one rounding, matched exactly. ⛔ Never a two-roundings bound.
   Sized after Mitre's plane probe, which may close part of it.
3. **(C), route (i) on the ring: the disc stamp inserts iA's rim crossings into the cut tile ring** (the exact vertices
   `cut(t.iA)` minted, matched exactly, never within a tolerance), so `ring − iA` leaves no needle.

## 2. Mutants, each must go RED

1. A beyond-rim vertex on one operand's copy of a shared line → a ≥ 1 lattice pair at the rim (B2's class). 2. The drawn
rim offset from the stencil by one step → a lot slice on a 'beyond' ray (B1's class). 3. The disc stamp's crossing not
shared with the tile ring → a sub-lattice needle in `A` (LS's class). Name the check (new or a row in an existing one).

## 3. Gates

Light first, on your producer dumps / an in-memory tile run: HPDM tile 242's 1.41 mm pair gone; B1's point (1352.96, 310.57),
read along Mitre's ray (station (1354.904, 308.036), direction (−0.60868, 0.79341)), reads walk, not lot; LS's tile-133 needle gone. Then the unowned count per town with the deformer
alone (target: HPDM's 599 → its non-rim remainder; name what's left by class). Then report and stop. The batch bake is
Boz's, after Jacob's go.

## 4. Bounds

Branch off `integration/2026-10-20` in a worktree under `.claude/worktrees/`; commit by pathspec; never push; Boz merges.
⛔ No served bake, Publish, Promote or Stage; never write `clean/` or `public/baked/`. Heavy runs: ask Boz (Kerf's
census holds the slot overnight). Measure before writing. Registers: `RIBBONS §1` (the compound shape: "the rim is an
edge of the drawing") if the construction's description changes, or say "reaches no register".

## 5. (D) The overlays are stamped with ①'s paint (Jacob, 2026-10-21 night)

**Ruling:** *"all of those layers are supposed to be flat and stamped at the same time."* **Premises: Zob's read on
integration 1011f428, premise pass folded in (11d01178 → next); confirm each against the code, and stop and flag Boz on a contradiction.**
- **Why:** `bake-ground#buildTileBakeShape` takes `cutOnce` from ①'s paint, then `pushMat`s the non-① overlays, and
  `clipAllToStencil` cuts each of them at the disc in its own op. That is a second rounding of the rim, and it's the 20 LS rim
  T-vertices of `claims-the-paint-takes-the-rim-crossings` (scrub × face, stripe × asphalt, 1.2–1.33 mm).
- **In:** non-street paths · park paths (not bridges) · leisure · parking lots · natural · the water BED · barriers ·
  edgelines · bike lanes · the centre stripe. Each joins ①'s one stamp in tileGround: one cut, one rim pass, the precedence
  of the paint stack. The map layers enter as `opts.overlays` to `buildTileGround`, passed by BOTH its callers (the bake
  and Survey's `BlockGeometryV2Debug`), so Survey still matches the bake. A missing input refuses; it never reads as "no
  overlays". Paths take their ground from the stamp's land-use fills (`paint.luByLu` minus park), never from a difference of
  ①'s paint. A closed buffered line (turning-circle stripe, yard fence) keeps its hole: `claims-a-closed-stripe-keeps-its-hole`
  is re-pointed at the new producer.
- **Out (ruled):** the water SHEET stays a tint over its bed (`DOES_NOT_CUT`/`KEEP_OWN_SLOT` for the sheet only). Bridges
  stay out: they belong to the off-the-ground family, `STYLE-GUIDE §10` Q10.a. **Water, sand, shore (Jacob, 2026-10-21 night):** *"it makes
  most sense to run to the bb and get stamped last exactly like the rest of the geometry."* ⇒ they extend to the bb (the frame,
  `BRIEF-coastal-hood`) and enter the one stamp LAST. ⚠️ The consequence: `shore-median.json` is written by a first ground pass
  today, so it isn't a pour input yet. The shore joins when it's made before the stamp: the coast-from-lidar work
  (`tern/coast-from-lidar`, unmerged). Until then the stamp takes the water bed and sand it has, and the shore second pass is
  named as the one thing left outside.
- **The stripe's slot** goes when stripe ∩ asphalt measures zero, which is its own comment's condition. Measure it; don't assume.
- **Removed in the same commit:** the overlays' path through `clipAllToStencil`, and the function itself once only the shore
  is left in it (else it stays for the shore alone, named). Its "not stamped with this disc" branch becomes a REFUSAL by name,
  never a silent re-clip. `claims-the-rim-is-cut-once` row (F) retires with its subject, named in the commit. Also removed:
  the stale yLift comment ("stripe — real overlays, real slots").
- **Gates:** `claims-the-paint-takes-the-rim-crossings` GREEN on LS (live 20 → 0) with its mutant still RED ·
  `claims-a-closed-stripe-keeps-its-hole` (re-pointed) and `claims-a-land-use-boundary-is-one-line` GREEN · stripe ∩ asphalt
  0 m² by the instrument the slot's own comment names · a ground bake on LS and HPDM with no refusal · tris and time vs
  today's (LS deploy run6, 2026-10-21: 309,018 tris, ground 224.8 s) · Jacob's eye.
- **Open (Boz's call, unless it changes the look):** refine policy. The hard overlays and park paths use a fixed edge
  length today, against the ground's adaptive tolerance.
