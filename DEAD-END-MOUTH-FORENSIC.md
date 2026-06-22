# Dead-end mouth forensic — why a dead-end T-mouth sidewalk butt-caps in Section, and why the polygon-path fix can't be byte-identical

**Status: ROOT + the blocking constraint DECISIVE (2026-06-22). No code shipped — two builds blocked on the iA gate, both reverted; `derive.js` + `tileGround.js` byte-clean at HEAD.** Live conclusions folded into `cartograph/SECTION.md §7` + `cartograph/RIBBONS.md §6.4`. This is the deep-dive; read it before re-attempting so the wrong turns aren't re-walked.

> ⛔ The operator (Jacob) drove the diagnosis; the recurring lesson held again — *the brief's obvious fix was wrong three times*, and the real shape only emerged from probing the frozen data.

---

## The symptom
Where a side street **dead-ends / T's into a through street** (Albion Place & Whittemore Place into Missouri Avenue; Kennett near Carroll), the side street's **sidewalk ribbon butt-caps flat** at the mouth with a step at the TL+SW⟷SW transition — instead of curving around into the through street's sidewalk as two corners. **Visible only in Section**, never in Survey.

## The barrier test (the operator's, decisive in 2 seconds)
Toggle the tile to **Survey: the curb is smooth and correct.** So it is **not** a curb/SHAPE bug — it is **FILL, but rooted in the frozen face's *identity*, not in the FILL strokes.** (The subtle case of the SHAPE/FILL barrier: a defect that only appears in Section but whose cause is the upstream face the FILL keys off.)

## The root (probed against the frozen artifact)
`extractFaces` (`tileGround.js:532`) builds the block face from **zero-width centerlines**; the curb is a *later* offset. A dead-end street is therefore walked as a **zero-width out-and-back spur**: the face ring goes out one side, around the degree-1 tip, and back — **the mouth vertex revisits its own coordinate** (tile[53] Albion: `ring[1] == ring[3] == [-177.5,-78.7]`, distance **0.00000 m**; same for Whittemore). Code says so verbatim (`extractFaces` lines 591–598).

The FILL (`sectionPassTile`) keys corner identity **by vertex** (`cornerT.get(tipKey(p))`). Both mouth corners land on the **one** collapsed vertex → a single `cornerT` key (`legs:2`) → only **one** fillet is wrapped; the other side butt-caps.

**The curb already carries the two corners.** Frozen `iA` for tile[53] is one 146-vertex ring with both mouth walls + the round tip-cap, and the two mouth corners exist as **`fillet[1]` and `fillet[2]`**. The defect is purely that the FILL's identity collapses them — iA is right.

**Scope:** ~**50 spur runs across ~21 faces** (detector: a street as consecutive same-`skelId`, opposite-`side` edges, mouth-revisit, degree-1 tip). **Multi-spur faces exist** (tile[11]=6, tile[43]=7). Author customs on the spurs: `kennett-place`, `park-avenue-1` (the 9 `blockCustoms` slots) — must survive any fix.

## The layer journey — the wrong turns (do NOT re-walk)
1. **FILL strip/depth fix** — ⛔ wrong layer. The doctrine (`SECTION §7`) says outright "a FILL fix is the wrong layer" for this. Confirmed: splitting the run-poly mouth coords *without* reshaping the ring creates two `cornerT` keys **but does not fix the visual** (no width-wide wedge for the bent sector to fill).
2. **Plain-junction construction / apron (the E3 campaign)** — ⛔ doesn't touch it. All junction construction (`apron`/`window`/`corner-cut`) lands in **`aFill` (asphalt)**; the FILL keys off **`tile.ring` (the face)**, which the construction never reshapes. (This is why the parked "Step 1" continuity-stamp was iA-neutral and inert; reverted.)
3. **Re-sequence the face-walk** (emit the through-frontage contiguous) — ⛔ **topologically impossible.** A closed ring genuinely revisits the mouth; you cannot reorder it. Any "make it contiguous" is a post-hoc regroup, and merging the through-frontage re-buckets `segOrd` → **orphans `park-avenue-1`'s seg1–6 customs.**
4. **Reshape the face — "expand + combine" the spur to width** (the operator's call: build The Polygon correctly at the source, no palimpsest) — the visual fix **works**, but fails the iA gate (next section).

## ⭐ THE BLOCKING CONSTRAINT — iA byte-identity is UNACHIEVABLE via ring-reshape
This is the load-bearing result. Two builds tried to reshape the spur face into a width-wide notch; both moved the frozen curb:

- **Attempt 1 (expand by `pavementHW` + combine, walls depth-0):** iA moved on **18/21** tiles, up to **~5 m**. Cause: the dead-end **cap is generated from the per-edge depth** (`offsetRingVariable`→`capArc`), and the engine offsets by the **resolved** depth (`effectiveMeasure`, asymmetric/lamp-corrected), not raw `pavementHW`. Marking walls depth-0 (needed to avoid re-offset) **also kills the cap**; a guessed stadium can't reproduce the engine's cap or resolved walls.
- **Attempt 2 (use the engine's *actual* offset+cap output as the depth-0 notch):** still fails. **Geometric proof:** today's mouth corner = the **offset-intersection** of the Missouri frontage (hw 8.18) against the **depth-bearing** Albion wall (hw 5.49). Make the Albion wall depth-0 and that intersection moves. **And `offsetRingVariable` + `filletRing` re-round on *any* face perturbation** — iA byte-identity is **false even at a 2 mm nudge** (EPS sweep). On a **multi-spur tile the nudge breaks iA catastrophically (Hausdorff 98 m)**.

**Conclusion:** opening the mouth in the face *necessarily* perturbs iA — at the mouth (a depth-dependent intersection) and globally (the offset/fillet pipeline is not stable under reshape). **The iA-byte-identity gate cannot be met by any ring reshape.** ⚠️ The author of the gate (Boz) had asserted "iA-identical by construction" — **that was wrong**; this forensic is the correction.

**The fix demonstrably WORKS visually:** splitting the mouth vertex in `ribbons.tiles[].ring` renders Albion×Missouri as two continuous wrapped mouth corners (proxy render eye-verified) — it just moves iA and can break multi-spur tiles.

## The open decision (for the operator)
The strict byte-identity gate is impossible; the real gate — per our own repeated doctrine (`SECTION §6.2`, `feedback_proxy_render_is_not_the_operator_eye`) — **was always the eye**. Two ways forward:
- **(a) Relax the gate to eye-validated + classified iA-delta on spur tiles only** (the `SECTION §3.3` "classified FILL delta" precedent) **+ per-tile robustness clamps for multi-spur faces** (so a tile[11]/tile[43] can't catastrophically break). The curb *should* change at the mouth — to the correct two-corner opening — so a bounded, eye-clean iA delta on the ~21 spur tiles is arguably *correct*, not a regression.
- **(b) The exact-intersection splice** — reshape the notch so the mouth corner reproduces today's offset-intersection exactly (the knife-edge both attempts died on; sub-mm sensitivity).

Lean: **(a)** — the byte-identity gate was a too-strict proxy for "didn't disturb the curb," but iA *will* and *should* move at the mouth; gate on the eye + bound the spur-tile delta + harden multi-spur.

## Companion requirement — strip-swappable dead-ends (operator, 2026-06-22)
"Not the same issue but in the family of how spikes are treated": the dead-end **cap ped-wrap is forced uniform/concrete** (the round-tip reclaim → SW, `sectionPassTile:~1197`). Dead-ends must be **strip-swappable** like normal frontage (treelawn-Y/N, LU↔SW per `resolvePedDepths`). This is the **FILL side** of the same "treat the spur as a real feature" work and depends on the notch landing first (so the wrap has properly-labeled wall+cap edges to stroke).

## Anchors
- Symptom/identity: `extractFaces` (`tileGround.js:532`, the zero-width-spur note 591–598); `cornerT` (`:1005`/`:1056`); fillets frozen by `filletRing`.
- The gate physics: `offsetRingVariable` (`:147`, per-edge `depthAt` + `capAt`/`capArc` `:79`); `effectiveMeasure` (`:712`); `edgeDepth` (`:731`).
- Doctrine homes: `RIBBONS §1` (construct hard polygons / the derivation chain), `RIBBONS §6.4` (this defect class), `SECTION §7` (the ped-junction item, the live conclusion), `HANDOFF-junction-construction.md` (asphalt apron — NOT this), `HANDOFF-freeze-the-curb-in-the-first-bake.md` (the curb-freeze relation).
