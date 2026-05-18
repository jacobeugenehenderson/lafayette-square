# Stage 10.5 — adj=null alley-hypothesis diagnostic

Extension of Stage 10. Diagnostic only. Run `node scratch/adj-null-alley-diagnostic.js` to regenerate.

## TL;DR — alley hypothesis REFUTED

Only **10 of 388 adj=null flanks (2.6%)** are explained by alleys / non-named-street features within 15m. The hypothesized "adj=null is operator-correct authoring meaning 'no street here'" interpretation does **not** account for the bulk of the failure surface. **Stage 11's planned 11a + 11b cannot be collapsed.**

The dominant cause of adj=null is structural and entirely upstream of `findAdjacentChainForBlockEdge` — the probe **never runs** for 95% of adj=null flanks. Two new failure-mode classes (not in §6.9's hypothesized taxonomy) account for this:

| class | count | % | what it is |
|---|---|---|---|
| `adjacent_arc_span` | 262 | 67.5% | The "flank" between this corner's arc-span and the next span around the rounded ring **IS another arc-span** (consecutive corners with no straight between). No straight-pts to probe; Stage 10's `(prevSpan?.type==='straight' && prevPts.length>=2) ? ... : { skip:true }` falls through to `{skip:true}` with `terminal=undefined` → looks like adj=null in the CSV. |
| `degenerate_span` | 106 | 27.3% | Straight flank exists in the partition but has <2 vertices (1-vertex span — the Bezier consume on both sides ate everything else). `findAdjacentChainForBlockEdge` returns null at `if (N<2) return null` BEFORE running the probe loop. |
| `alley_present` | 10 | 2.6% | Probe ran, found nothing within ribbons; an OSM `service:alley` is within 15m of some probe step. |
| `truly_void` | 10 | 2.6% | Probe ran, found nothing within 15m at all (park interior, water, fade-zone). |
| `something_unexpected` | 0 | 0% | A named ribbon-street within 15m that the probe missed. **No probe bug.** |

**All 10 alley_present hits are `service:alley`.** No footway / path / pedestrian / steps hits — those exist in OSM but aren't sitting at the flanking positions of corner arc-spans.

## Stage 11 implications

The fix shape implied by this audit is **NOT** "treat adj=null like terminal=none." Both of those modes have something concrete to fall back on (`tl=0, sw=0` from authored intent). The 95% of adj=null flanks have **no flank at all** — the rounded-ring partition between this corner and the next has no straight segment to inherit a measure from.

Stage 11 designs must address:
1. **`adjacent_arc_span` (67.5%)**: when a corner's arc-span sits next to another arc-span, how is the depth at the tA / tB boundary derived? Today the meta-fallback `?? Ameta?.tl ?? Bmeta?.tl` is `?? undefined ?? undefined = undefined → 0`. Possible fixes: (a) inherit from the *adjacent corner's* averaged or mirrored input flank, (b) walk further around the ring past the adjacent corner to the next straight, (c) skip emission for these (current behavior produces zero-depth pads). None of these are doctrinally clear; needs operator input.
2. **`degenerate_span` (27.3%)**: a 1-vertex straight is structurally identical to no-straight. Same options as above. Likely fixable by relaxing the Bezier consume-span to leave ≥2 vertices on each side, but that affects the Bezier shape — outside Stage 10.5's scope.
3. **`alley_present` (2.6%)** + **`truly_void` (2.6%)**: these are the only cases the brief's "alley hypothesis" actually targets. Small enough that even if Stage 11 handles them well, the overall wrong_flanking count barely moves. Both can probably collapse into terminal=none semantics (no ped zone authored → no flank depth contributed).

The probe is **not buggy** (something_unexpected = 0). Stage 11a's planned probe-fix work has nothing to fix on LS as authored today.

## Mississippi × Park (V = 229, −158.9)

Two adj=null flanks at this IX:

| corner | block | side | class | feature |
|---|---|---|---|---|
| SW | 117.0,-299.0 | next | `degenerate_span` | (no probe) |
| NE | 306.0,-2.5 | prev | `degenerate_span` | (no probe) |

**Both are `degenerate_span`, not alleys.** The NE-side defect Jacob called out at Image 21 is therefore a 1-vertex straight (Bezier consumed all but one vertex from the prev-flank between NE corner and the SE-adjacent corner) — *not* an alley nor a probe failure. The fix needs to address consumption pathology + how depth gets resolved when the partition has no straight on one side.

Verifying in the partition data (from the diagnostic's trace): on block 306.0,-2.5 the rounded ring is 124 vertices; NE corner's prev-span has 1 vertex. The cause is the Bezier consume walking from NE's cornerIdx until it hits the adjacent corner's consume span boundary — leaving 1 vertex between them. NOT an authoring issue. NOT a probe issue.

## Anomalies surfaced (per `feedback_baby_must_surface_scope_drift`)

1. **§6.9's hypothesized adj=null taxonomy was incomplete — it assumed all adj=null events flow through the probe.** In production code, only 5.2% (20/388) actually do. The other 94.8% are structurally short-circuited BEFORE the probe runs, in two distinct sub-modes (`adjacent_arc_span` and `degenerate_span`) that need to be named in §6.9 v0.8.

2. **Stage 10's CSV adj=null count (388) was correct but undifferentiated.** A reader scanning Stage 10's CSV would see 388 `prevMeta_skip=1 AND prevMeta_terminal=''` rows and assume probe failure for all of them. The Stage 10 report.md's discussion of "adj=null as probe failure" was right for the 20 cases but wrong for the 368 structural cases. Recommend a corrigendum row in §6.9.

3. **All 10 `alley_present` hits are `service:alley` (no footway / path / cycleway / pedestrian).** Footways are ubiquitous in OSM (1218 of 2032 highway features) but they sit at sidewalk locations, not at the block-edge midpoints the probe walks toward. Service:alley features sit at block midline (where alleys typically run between buildings), which IS where the corner's flanking-span midpoint probes outward — explaining why this single tag type captures the entire alley_present bucket.

4. **No `something_unexpected` cases (= 0% probe bugs).** The probe is not the problem. PROBE_MAX=30 is sufficient; the bbox / segment-distance math is correct. Stage 11a's probe-fix scope is empty on LS today.

5. **The brief's data-source question (raw OSM vs clean/map.json):** `cartograph/data/lafayette-square/raw/osm.json` was chosen because it carries `ground.highway[]` with the full OSM tag set (including unnamed footways and service ways) AND coords are already in LS-projection x/z (verified by spot-checking one coord against ribbons). The alternative `clean/map.json` only carries post-classify derivative geometry, no raw highway features. Surfaced; no alternatives plausible.

6. **Probe outward-walk direction is degenerate for spans with <2 vertices.** This is the same defect as `degenerate_span`: midpoint tangent computed from a single point yields a zero vector. Not a separate issue — same underlying class as #2 above. Worth noting for completeness: even if the probe COULD walk from a 1-vertex span (e.g., using the adjacent block-ring edges), it has no well-defined normal direction to walk along.

## File-by-file outputs

- `scratch/adj-null-alley-diagnostic.js` — script (~280 LOC, modeled on Stage 10's audit but with 5-class classification).
- `scratch/adj-null-alley-diagnostic.csv` — 388 rows (one per adj=null flank), sorted by (ix_key, blockKey, side).
- `scratch/adj-null-alley-diagnostic.md` — this file.

## CSV columns

```
ix_key, V_x, V_y, blockKey, side, span_vertex_count,
probe_mid_x, probe_mid_y, probe_normal_x, probe_normal_y,
probe_path_len_m, probe_steps, probe_null_reason,
alley_class, feature_highway, feature_name, feature_distance, feature_source
```

Filter examples:
- `alley_class == "alley_present"` → 10 rows, all `feature_highway == "service:alley"`.
- `alley_class == "something_unexpected"` → 0 rows. (No probe bugs.)
- `alley_class == "adjacent_arc_span"` → 262 rows. Stage 11's biggest fix surface.
- `alley_class == "degenerate_span"` → 106 rows. Stage 11's second-biggest.

## Cross-arc finding for the coordinator

The brief asked: "what fraction of adj=null is alleys? If ≥70%, the unified meta-resolution fix is doctrinally clean. If <30%, the probe has a real bug and 11a stays as a probe fix."

The answer is **neither**. Only **2.6% are alleys**, and **0% are probe bugs**. The dominant 94.8% is a third thing entirely — the partition produces flanks that don't exist (arc-adjacent) or are too short to probe (degenerate). Stage 11's fix design must address this structural issue first. Once the structural cases are handled (whether by re-resolving depth via adjacent-corner inheritance, or via skipping emission, or via relaxing the Bezier consume), the residual ~20 actually-probed adj=null flanks can fold into terminal=none semantics with no doctrinal complication.

The brief's hypothesized "11a + 11b unification" is therefore the right *direction* but for the wrong *reason*: unification works because the alley/void cases are structurally simple, not because adj=null is operator-correct authoring writ large.
