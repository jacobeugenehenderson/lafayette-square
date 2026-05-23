# Q2 — ed29700 baseline comparison

Worktree: `git worktree add ../baseline-ed29700 ed29700`. node_modules symlinked from main checkout; scratch/baseline-probe.js mirrored Stage 1's classification + the drifted-overshoot probe.

## Numbers

|                                                | HEAD (43dd775) | ed29700 |
|---|---|---|
| total frontageBands entries                    | 725            | 506 (no arc emitter yet) |
| straight fes                                   | 506            | 506 |
| drifted (blockKey ∉ blockRounded)              | 295 (58.3%)    | **295 (58.3%)** |
| lookup-OK PIR-outside (Stage-1 metric)         | 194 (91.9%)    | 190 (90.0%) |
| lookup-OK real overshoot (>0.01m)              | 0 (0.0%)       | 0 (0.0%) |
| drifted real overshoot vs true ring            | 250/257 (97.3%)| **250/257 (97.3%)** |
| drifted LARGE overshoot (>0.5m)                | 248            | **248** |
| max overshoot magnitude                        | 8.3 m          | (same; entries match) |

## Verdict

**Pre-existing latent defect.** ed29700 has the IDENTICAL drift profile: 295 drifted entries, 248 large overshoots, max 8.3 m. Phase 2 didn't introduce it; the Phase-2-arc revert didn't restore it; it's been there at least since `ed29700` (probably since D.7a customs migration introduced the pass-1→pass-2 split, but the bug only surfaces when blockCustoms are present and the lookup map disagrees).

`buildFrontageBands` body is functionally identical between ed29700 and HEAD — diff shows only comment removals in the restored helper. The revert was verbatim.

**Why it became visible now:** the L-strip wasn't user-noticed before this session because (a) per-LU treelawn rendered opaque-per-parcel-color, so overshoots blended with adjacent block fills, and (b) no aerial toggle was exposing the void. The new aerial-on-Measure interaction + H3's no-translucent-variant in `treelawnByLuGeo` + the geometric overshoot together produced the L-strip symptom.
