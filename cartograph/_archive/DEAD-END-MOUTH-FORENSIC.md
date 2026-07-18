# Dead-end mouth forensic — why a dead-end T-mouth sidewalk butt-capped in Section, and the FILL-side lever that wrapped it (iA byte-identical)

**Status: ✅ LANDED — eye-confirmed by Jacob ("Victory!", 2026-06-22).** The dead-end mouth sidewalk now WRAPS both corners, and the straight set-back leg DIPS IN (the deep-leg slide) — verified on the lit app at Albion×Missouri + multi-spur tiles. The fix is a **FILL-side bounded lever**, NOT a face reshape (`opts.deadEndMouthWrap`, default-on, `src/lib/tileGround.js`): **iA byte-identical on all 101 tiles.** Live conclusions in `cartograph/RIBBONS.md §6.4` + `SECTION §7`.

> ⛔ **THE lesson of this arc (banked hard):** every proxy/numeric check LIED — twice we reported "LANDED, green" off proxies that rendered wraps the lit app did not show. **The operator's eye was the only gate.** The "DECISIVE BLOCKING CONSTRAINT" below (iA-unachievable-via-ring-reshape) is TRUE but turned out IRRELEVANT — the FILL-side lever sidesteps a face reshape entirely. Boz reported success on proxies twice before the real fix; do not repeat. The wrong-turns are kept below as history so they aren't re-walked.

## ✅ THE RESOLUTION — the FILL-side lever (read this first)
The wrap needs three things, all FILL-side, none touching `tile.ring`/`iA`:
1. **Two corner identities.** The collapsed mouth gives one `cornerT` key. SNAP the two spur run-ends to their two distinct fillet apexes (own-side by cross-product) → two keys. *(Alone, this is INERT — wrong-turn #1.)*
2. **Free the wedge.** The through-road's leg-sector COVERS the corner wedge (`bandRem∩disc = 0` — measured), so the bent sector has no room. TRIM the through-road run back by the per-mouth disc radius at the mouth → `bandRem` freed → the bent sector builds at each apex. *(This is the piece the run-identity-only splice missed — "no wedge.")*
3. **The straight leg dips in (the integration).** Each mouth corner's `cornerT` had only ONE leg (the spur side; the through-run is a suppressed through-node), so the existing **Idea-A deep-leg slide** (`SECTION §6.1` step 5) never fired. Synthesize the missing **second (through) leg** on the mouth `cornerT` → the unmodified slide builds → the set-back leg ramps to the curb (treelawn tapering) into the wrap.

**Bounded per-mouth disc** (centered on the fillet midpoint = the asymmetric pavement center; Lafayette 10.56/7.90) makes multi-spur tiles independent — no whole-ring reshape, so **iA is byte-identical** and the 98 m multi-spur blow-up never occurs. 39 mouths / 20 tiles built; Benton/Waverly/Saint-Vincent loops excluded (gated to `deadEndSkels`, deg-1 tips); `kennett-place`/`park-avenue-1` customs untouched (segOrd byte-stable). **ROLLOUT EXTENSION (landed 2026-06-22):** the "8 single-fillet fallback mouths" was a MISCOUNT — only **2** are genuine single-corner mouths (`south-13th`, `henrietta`, one-sided by topology); the other 6 names resolve to the dead-end's far **tip** (correctly excluded — a tip is not a mouth). The wrap now handles 1-or-2 fillets, so those 2 wrap their one corner. **Strip-swappable** cap rebuilt (routes the reclaim sliver to the cap-owning run's outer strip material — mostly dormant, only `carroll-street-1` actually leaves a sliver). iA byte-identical; FILL changed on 3 tiles (10/12/25). **STILL OPEN:** the **+5 `junction-band`** LU ramp-wedge eye-call (clean taper vs sliver; iA untouched). ⚠️ **NOT covered by this fix at all** — the 23 operator-circled corners (`scratch/CORNER-MARKERS-2026-06-22.md`) are mostly **through-T / divided-junction** corners (§5b/§5e), a separate campaign — see that worklist + the default-fill note there.

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

**Conclusion (true, but SIDESTEPPED):** opening the mouth *in the face* necessarily perturbs iA (depth-dependent intersection + the offset/fillet pipeline re-rounds on any perturbation; multi-spur blow-up to 98 m). So a **ring-reshape** can't hold iA. ⚠️ Boz's "iA-identical by construction [via ring-reshape]" was wrong — but the lesson is the bigger one: **don't reshape the face at all.** The FILL-side lever (top) wraps the mouth without touching `tile.ring`, so iA is byte-identical AND the wrap lands. The constraint stands; it just doesn't apply to the path that won.

⚠️ **Proxy-lied marker:** the ring-reshape proxy render *appeared* to wrap, and was reported as a success — but on the lit app it did NOT (and it moved iA). Two separate "LANDED, green" reports this arc came from unfaithful proxies. **Only the eye landed it.**

## ~~The open decision~~ → RESOLVED (the FILL-side lever, see top)
The decision framed here — (a) relax the byte-identity gate + accept a local iA delta via a bounded face-notch, vs (b) an exact-intersection splice — was **made moot** by the FILL-side lever (top): it wraps the mouth WITHOUT reshaping the face at all, so iA stays byte-identical AND the wrap lands. Both face-reshape options were unnecessary. *(Kept for the reasoning trail: the instinct "the curb should change at the mouth" was wrong — the curb already carried the two corners; only the FILL needed to use them + get a wedge + the slide.)*

## Companion requirement — strip-swappable dead-ends (operator, 2026-06-22) — ⚠️ STILL OPEN
"Not the same issue but in the family of how spikes are treated": the dead-end **cap ped-wrap is forced uniform/concrete** (the round-tip reclaim → SW, `sectionPassTile:~1197`). Dead-ends must be **strip-swappable** like normal frontage (treelawn-Y/N, LU↔SW per `resolvePedDepths`). This is the **FILL side** of the same "treat the spur as a real feature" work. ⚠️ It was implemented in an earlier reverted attempt and **NOT yet rebuilt** on the landed mouth-wrap — a clean follow-up now that the wrap + slide are in.

## Anchors
- Symptom/identity: `extractFaces` (`tileGround.js:532`, the zero-width-spur note 591–598); `cornerT` (`:1005`/`:1056`); fillets frozen by `filletRing`.
- The gate physics: `offsetRingVariable` (`:147`, per-edge `depthAt` + `capAt`/`capArc` `:79`); `effectiveMeasure` (`:712`); `edgeDepth` (`:731`).
- Doctrine homes: `RIBBONS §1` (construct hard polygons / the derivation chain), `RIBBONS §6.4` (this defect class), `SECTION §7` (the ped-junction item, the live conclusion), `HANDOFF-junction-construction.md` (asphalt apron — NOT this), `HANDOFF-freeze-the-curb-in-the-first-bake.md` (the curb-freeze relation).
