# HANDOFF — D1: longitudinal carriageway weld (+ D6: serialize oneway)

**State:** dispatch-ready. **Agent: WARM → Groma** (same `skeleton.js` machinery as the station-overlap gate `8ffd795`; knows `weldChains`, the pairing, the oneway-flip-forbid). **Domain:** cartograph frame — `skeleton.js` (D1) + `derive.js` serialize (D6).
**Drafted:** 2026-06-03 (Boz). **Re-bake ordering:** coordinate with Boz (Theodolite's D5 dead-end prune also re-bakes LS).

---

## The keystone (Galen's census, `TRUMAN-FORENSICS.md`)

Truman is one physical road — two carriageways, each ~748m end-to-end — but the app shatters each into **4 chains** (8 total). The median the operator wants exists as **no single object**. **Root = D1:** `weldChains`'s `(signature, pairKey)` gate refuses to fuse a carriageway's **own colinear continuation** (the signature flips wherever pairing turns on/off, and pairing is intermittent because the two carriageways' junctions are staggered ~80m). Everything downstream — lopsided/absent median, the island sliver, the un-grabbable median, the LU mis-tagging — is a **consequence**. Fix the fragmentation and the clean continuous median **falls out for free** (it's an emergent inter-carriageway face).

## Read first (do not re-derive)

1. **`cartograph/TRUMAN-FORENSICS.md` §1, §1.1, §5 (D1/D2)** — the full diagnosis + the re-measured stagger (every overhang 76-87m; `#5/#6` = 0.00 station overlap, correctly unpaired). The two strands are already geometrically continuous (shared-endpoint scan, all tail-to-head, same heading):
   - **Strand A:** `#0 → #6 → #3 → #1`  (≈747m)
   - **Strand B:** `#2 → #5 → #4 → #7`  (≈749m)
2. **`skeleton.js:321-385`** — `weldChains`. The weld is gated on **`signature` AND `pairKey` equality** (`:340-341`). **That gate is CORRECT for its purpose** — it blocks cross-carriageway fusion (the **Lafayette 22→1 / Park-Ave-bow** bug). Do NOT remove it. The **oneway-flip-forbid at `:354-379`** already blocks the dangerous flip case — reuse it.
3. **memory `feedback_perp_side_convention`** — `innerSign` is per-chain-relative and **CORRECT** (`#0/#4` both `−1` is right for their orientation). **Do NOT touch `innerSign`** (D7 is deferred TBD).
4. **`derive.js` street serialize map** (the `ribbonStreets.map(...)` that emits `ribbons.json` streets) — for D6.

## The fix

### D1 — direction-strict longitudinal weld (`skeleton.js`)
Add a weld pass that fuses **tail-to-head, same-heading fragments of the same corridor regardless of `signature`/`pairKey`** — but **NEVER flips** (reuse the `:354-379` oneway-flip-forbid so the cross-carriageway fusion the existing gate prevents stays prevented). Result: `#0→#6→#3→#1` becomes ONE chain, `#2→#5→#4→#7` becomes ONE chain. Re-assert one `inner-edge` anchor per resulting carriageway (the paired-segment anchor should propagate across the welded continuation). The existing `(signature,pairKey)` gate stays as the guard against *lateral* fusion; this new pass handles *longitudinal* continuation.

**Be precise about "same corridor, same heading, tail-to-head":** the join must be a true endpoint coincidence (≈0.00m, per the census's shared-node scan) with continuous heading (no reversal, no sharp angle) — i.e. a colinear continuation, not a junction branch. A degree-3+ node is a junction, not a weld point.

### D6 — serialize `oneway` (`derive.js`)
Add `oneway` (and ideally `phase.role`/`pairKey`) to the serialized street fields. Today it's dropped → Survey's One-way checkbox always renders unchecked on divided carriageways. Cheap, independent.

## Acceptance gate (the dispatch's definition of done — a before/after table)

**This is delicate frame surgery; the gate is no-regression, not just Truman:**
- **Truman:** 8 chains → **2 continuous carriageway chains** (Strand A, Strand B), each one `inner-edge`, the whole corridor.
- **No regression — every divided road still resolves to exactly 2 carriageways:** Lafayette (no 22→1 re-fusion), Park Ave (no bow), South Jefferson, Officer David Haynes. **Report the carriageway-chain count per divided corridor, before and after.** Any corridor whose count drops below 2 or fuses laterally = STOP and flag Boz.
- **Emergent median improves:** after re-bake, the Truman inter-carriageway face should read closer to one continuous strip (verify the `shape.json` median tiles consolidate vs the current 71×303-strip + 15m-island + absent trio). It need not be perfect (D3/D8 tagging is downstream) — but it must be *more* continuous, proving D1 unblocks it.
- **D6:** `ribbons.json` streets now carry `oneway`; Truman's carriageways show `oneway:true`.
- **If a single weld rule can't both fuse Truman AND avoid lateral re-fusion on Lafayette/Park, STOP and flag** — don't force it.

## Build sequence (skeleton changed → full chain)
```
node cartograph/skeleton.js
node cartograph/pipeline.js --skip-elevation
node cartograph/promote-ribbons.js --scene=lafayette-square
node cartograph/bake-ground.js --look=lafayette-square
```

## Write / commit boundaries
- **Edit `skeleton.js` (D1) + `derive.js` (D6)** + re-baked artifacts. **Canon docs off-limits** — Boz folds D1/D6 into RIBBONS/PIPELINE after it lands.
- Branch off current `cartograph-looks-pass-ab`; the load-bearing record is the code comment (state the longitudinal-vs-lateral weld distinction in `weldChains`). `Co-Authored-By` trailer.
- **Coordinate the LS re-bake with Boz** — Theodolite's D5 dead-end prune (`tileGround.js`) also re-bakes; D1 reshapes the faces D5 operates on, so sequence the bakes (don't race ground artifacts).
- Final message: the per-corridor carriageway-count before/after table + Truman's 8→2 result.

## On landing (Boz)
- Fold into canon: `RIBBONS §3.1`/`FEATURES §367` (longitudinal weld → continuous carriageways → emergent median falls out) + `PIPELINE` frame note; flip docket D2 (dissolves), re-evaluate D3/D8 (should mostly dissolve) + D7 (innerSign recheck on the welded corridor). Retire `TRUMAN-FORENSICS` leads as they close.
