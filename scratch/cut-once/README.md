# scratch/cut-once — BRIEF-cut-once-in-full-precision §3.1 (Plumb, 2026-10-28)

Fixtures and their provenance: `fixtures/README.md`. Yardstick: `own-edge.mjs`. Runner: `node scratch/cut-once/compare.mjs --cand=integer`.

## The libraries: measured, then STOPPED (Jacob, 2026-10-28, via Boz: "go with candidate 3")
These were packed into `candidates/` (never committed, never imported by the kit) and **deleted** the same night. The runner
(`cand-jsts.mjs`) went with them, in commit a06f639d. What was measured:

| package | version | licence | tgz | runtime deps |
|---|---|---|---|---|
| jsts | 2.12.1 | (EDL-1.0 OR EPL-1.0) | 796 KB (6.4 MB unpacked) | fastpriorityqueue 0.7.5 (Apache-2.0) |
| polygon-clipping | 0.15.7 | MIT | 91 KB | robust-predicates 3.0.2 (Unlicense), splaytree 3.1.2 (MIT) |

No install scripts in any package.
- ⛔ **polygon-clipping is booleans only.** It has no buffer or offset, so it cannot erode or dilate.
- ⛔ **JSTS has two silent fallbacks.** `BufferOp.computeGeometry` retries at reduced precision (12 digits down to 0) on any
  exception, and its booleans go through `SnapIfNeededOverlayOp`. Its buffer also simplifies its input at 0.01 × distance by
  default. The candidate bypassed all three and counted them.
- **PTown decks:** 5 strict overlay failures (a real build would get silently snapped results) and **1 part refused** even through
  the fallback: the 164-vertex deck at (276.4, 339.9). Its float re-offset is a second copy of a source edge **~0.14 units off**:
  (347125.011, 488949.863) against the source's (347125, 488950). That is the brief's defect in doubles; the copy is smaller, not
  gone. On the parts JSTS computed: 0 copies, 0 crossings, 0 edges ≤ 2 mm. Breakwater: clean. Huron: not run.

## The integer baseline (today's kit), `compare.mjs --cand=integer`
| fixture | own | copy | new | crossings | ≤ 2 mm |
|---|---|---|---|---|---|
| PTown decks (cut once) | 427 | 109 | 8 | 2 (Coast Guard pier, (−55.8, 990.5)) | 10 |
| PTown Breakwater (opened) | 56 | 0 | 0 | 0 | 0 |

Huron's traced water, from `baseline.mjs` before the yardstick's last refinement (re-run with compare.mjs before quoting):
integer gives own 27,336 · copy 91,990 · new 27,193; cut once gives own 86,575 · copy 4,278 · new 1,667, plus the debt's
vertex passed 3 times.
