# HANDOFF — Name-aware skeleton pass (weld same-name fragments + straighten within-name dog-legs)

**State:** dispatch-ready (drafted 2026-06-04, Boz) — **sequence AFTER §Wall lands** (see Coordination). **Domain:** cartograph SHAPE / frame — `cartograph/skeleton.js` (chain assembly / welder). Part of the **"better bones"** arc (`BACKLOG.md` L38) with a new **semantic name prior**. **Agent call:** see Coordination (likely a Chord follow-on or fresh off Bollard's findings — NOT Bollard, who's on the band-fold in a different file).

---

## The finding (Bollard's forensic — `HANDOFF-junction-band-thorns-FINDINGS.md §"name-logic"`)

Jacob's instinct, now with data: *"the skeleton maker should use the names; there shouldn't be dog-legs within a named street."*

- **35 of 113 named streets are fragmented** into >1 segment (weldable into continuous chains by name).
- **5 within-name dog-legs** — a single named street kinking sharply at its own seam:

  | where (local x,z) | street | kink off-straight |
  |---|---|---|
  | `[−416.4,−164.2]` | Saint Vincent Ave | **88°** |
  | `[58.7,−234.0]` | Benton Place | 37° |
  | `[521.7,−560.1]` | Papin Street | 25° |
  | `[509.7,−570.1]` | Papin Street | **146°** |
  | `[780.1,99.7]` | Park Place | 17° |

- **Separate population from the junction thorns** — these are **deg-2 within-name seams**, not deg≥3 T-junctions; none coincide with the marked thorn circles.
- **Bonus payoff:** Saint Vincent + Benton are the exact two "butt-tip" chains that **broke the parked dead-end prune** (`bollard-dead-end-prune`) — they were never dead-ends, they're **mid-street fragmentation seams.** Name-logic flags them up front → **de-risks the dead-end work.**

## The pass (in `skeleton.js`, name as a prior on top of geometry)

1. **Weld same-name fragments.** Same-name chains that are **geometrically continuous** (near/shared endpoint + continuous heading) weld into one chain — the name is a **prior that *permits* a weld the geometry already supports**, not a standalone rule. Build on the existing weld machinery (`weldChains`, D1 `5348fbc`) by adding the name signal; don't fork a parallel welder.
2. **Straighten within-name kinks** (the 5). A sharp kink at a **chaining seam** (artifact — the welder joined two fragments at a wrong angle) gets smoothed to the continuous alignment.

## ⛔ Guards (this is welder territory — the 13-month chains-swamp; scope tight)

- **Junction-protected** — never weld across, delete, or move a real degree-3 junction (the 79-interior-Ts lesson, `OSM-FORENSICS`). Verify junctions before==after.
- **Name is a PRIOR, not a hard rule — do NOT over-weld.** Don't fuse same-name pieces that are genuinely separate: a street split by a park/barrier, two unrelated streets sharing a name, or pieces that meet at a real junction/branch. Geometry (continuity, proximity, heading) must agree.
- **Per-case verify the 5 kinks: artifact-seam vs REAL bend.** St Vincent 88° / Papin 146° read as artifacts (seams); **Park Place 17° / Papin 25° may be genuine gentle bends — do NOT straighten a real bend.** Confirm each is a seam before touching it; report the disposition per kink.
- **Don't reinvent** — survey `osm2streets` (A/B Street) chain-assembly / the broader graph-clean; the name prior is the semantic addition on top.

## Acceptance gate (Jacob's eye + metrics)

- The **artifact** within-name dog-legs resolved (smooth alignment, no seam-kink); any **real bend** in the 5 explicitly left alone, with the disposition stated.
- Same-name fragment count **drops** where geometry agrees (report before/after; target < 35) — **no over-weld** (no genuinely-separate same-name streets fused).
- **Junctions preserved** (before==after).
- **St Vincent + Benton no longer present as butt-tip false-dead-ends** → re-test against `bollard-dead-end-prune` (this is the de-risk).
- Jacob's eye on the 5 sites + a spot-check of welded fragments.

## Build sequence (skeleton changed → full chain)
```
node cartograph/skeleton.js
node cartograph/pipeline.js --skip-elevation
node cartograph/promote-ribbons.js --scene=lafayette-square
node cartograph/bake-ground.js --look=lafayette-square   # ⚠️ --look required
```

## Coordination / boundaries (Boz holds this)

- **`skeleton.js` is also Chord's §Wall file** (the RDP simplify). **Do NOT run this concurrently with Chord's skeleton work.** **Dispatch AFTER §Wall lands + merges to trunk** — build on the simplified frame. *Then* this can run **in parallel with Bollard's band-fold** (band-fold = `tileGround.js`, a *different* file → no collision).
- Branch off the **§Wall-inclusive trunk**, own worktree (`isolation: "worktree"`).
- **Edit `cartograph/skeleton.js` only** + re-baked artifacts. Canon docs off-limits — Boz folds into `PIPELINE P1` + "better bones" after it lands.
- **Coordinate the re-bake with Boz.** Report the before/after fragment count, the 5-kink dispositions, and the St-Vincent/Benton dead-end re-test.

## On landing (Boz)

- Fold into canon: `PIPELINE P1` (name-aware weld/straighten as a frame fact) + the "better bones" BACKLOG item; flip the dead-end HANDOFF note (St Vincent/Benton resolved); retire this file → NOTES.
- This is the **upstream half of "better bones"** (the skeleton/topology prong); the **band-fold** (`sectionPass`) is the downstream construction half; **intersection consolidation** remains the third (still forensic-first).
