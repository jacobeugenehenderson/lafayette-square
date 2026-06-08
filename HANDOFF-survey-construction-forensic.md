# HANDOFF — Forensic deep-dive: the Survey construction artifacts (corner-registration gap + the 4 tension marks)

**Goal:** a **sharp, complete understanding** of the remaining Survey-SHAPE construction artifacts, in one sweep: **(1)** the ~136 real corners that don't register a fillet/handle, and **(2)** Jacob's 4 marked "SVG-overdraw / tension" spots. For each: **classify the artifact, pin the exact construction op (`file:line`), name the root, and the fix locus (where, not how)** — and determine **whether they share one root.** Diagnosis only — **no fixes.**

**Agent: FRESH** (cold eyes — the Plumb/Sextant forensic-gunslinger pattern; name yourself). **Read-only** — no code/canon/bake edits. Deliverable = `scratch/SURVEY-CONSTRUCTION-FORENSIC.md` + a structured final summary. Worktree optional.

> ⚠️ **Be skeptical of the docs / your own first guess** — verify against the code/render, the code wins, flag divergences. **Jacob's eye is the gate** — proxies (scratch renders) are allowed but labelled as proxies; *locate* precisely, don't declare fixed. Today two forensics paid off by killing the coordinator's hypotheses (Plumb killed "E2 construction"; Sextant killed "junction construction" → it was a width datum). **Kill a hypothesis the moment the code contradicts it.** (`feedback_proxy_render_is_not_the_operator_eye`, `feedback_shape_proofs_dont_gate_fill_geometry`.)

## VERIFIED this session — build on these, do NOT re-derive
**(1) The corner-registration gap** (`scratch/cornerfillet-coverage.mjs`, run it): of **985** centreline-face-ring vertices across 101 tiles — **329 straight <18°** (correctly no corner), **602 real corners 18–160°**, **54 reflex >160°** — only **466 register a `cornerFillets` entry** → a magenta/gold handle. So **~136 real corners (≈23%) are unstamped** → **no Survey handle AND a dysfunctional Section bent-quad** (Jacob: one root, both tools). It's a **live-build** gap (Survey runs the live build; not the frozen-Measure path).

**(2) The 4 marks** (`cartograph/data/lafayette-square/clean/marker_strokes.json`, saved 2026-06-08) — Jacob's words: *"feels like SVG overdraw / weird tension artifacts (AI→SVG)"*:
| # | centroid | shape | area |
|---|---|---|---|
| 0 | `[454, -90]` | 36×17 region | — |
| 1 | `[177, 200]` | thin vertical | **the park, Mississippi×Lafayette** (the old false-corner node) |
| 2 | `[706, 302]` | thin horizontal | east |
| 3 | `[-344, -244]` | thin horizontal | southwest |

**Context (today's wins, so you don't re-chase them):** the no-mouth-side doglegs are FIXED (datum repair, `8452c31`); the handle anchor works (`cba3cde`); the corner is a **disk-primitive** in `sectionPass` (Plumb, `scratch/SECTION-FORENSIC.md` — Fix B, still open).

## Read first (claims to verify) → then trace (reality)
**Claims:** `scratch/SECTION-FORENSIC.md` (Plumb — the corner-disk primitive) · `scratch/JUNCTION-FINISH-FORENSIC.md` (Sextant — the datum/THRU pattern) · `RIBBONS.md §3.9a` (corner = bent *slice*, never a primitive) + **§6.3 (the ~49 residual SELFINT band rings — "overdraw"?)** + §6.9/6.10 · `SKELETON.md §5e` (the corner-builder root) · `JUNCTION-CURE-PLAN.md` · `HANDOFF-band-fold-fix.md` + `HANDOFF-junction-band-thorns-FINDINGS.md` (the `iW`-fold = literal overdraw) · `BACKLOG` the **curve-and-cut** class (block edge curving-in-then-cutting near a junction).

**Reality — `src/lib/tileGround.js`:** `filletRing` (`:188`) + `sharpCornerIndices` (`:201`) + the gates `dedupeRing`/`MIN_CORNER_LEG=0.05` (`:97`) + `FILLET_TURN_TOL=18°` (`:84`) + the `fSink → cornerFillets` stamping (where a corner gets/doesn't get an entry); the concentric offsets `iC/iT/iW` in `sectionPass` (self-intersection = the overdraw candidate); the **[E3.2/E3.3] junction construction** (`:1104`+, windows/aprons/corner-identities — do constructed corners stamp a `cornerFillets`?); `extractFaces` (the face topology). Run the harness; instrument `cornerFillets` keys vs `sharpCornerIndices` per tile to bucket the 136.

## The questions the report MUST answer (with `file:line` + labelled proxies)
1. **Taxonomy of the 136 unstamped corners.** Bucket them: **short-leg** (`< MIN_CORNER_LEG`)? **near-straight** (in the 18–tol band)? **junction corners the E3.2/E3.3 construction builds but never stamps a fillet for**? **degenerate / thin-tile / capacity-clamped**? **reflex-adjacent**? Give counts per bucket + the WHY for each, and the **Section bent-quad consequence** of an unstamped corner (does `sectionPass` mis-build the corner FILL there?).
2. **Classify each of the 4 marks.** Render each at its coordinate (labelled proxy). Is it a **self-intersecting offset** (a band ring folding = literal "overdraw" — `RIBBONS §6.3`)? the **curve-and-cut** class? a **curve-tension bulge** (smoothing/Bezier)? the **corner-disk**? or something **new**? Pin the exact op (`file:line`) and the root for each. (Mark #1 sits at the old false-corner node — check if it's an E3.3 corner-identity residual.)
3. **One root or many?** Do the corner-registration gap and the 4 marks trace to the **same** construction op (the fillet/offset pass), or distinct roots? Be explicit — don't assume the operator's visual unification is a code unification (the false-corner-saga discipline).
4. **Fix locus per class** — where would each be fixed (which function + line; the *gate* or the *construction*), **where not how**, ranked by leverage.

## Deliverable
`scratch/SURVEY-CONSTRUCTION-FORENSIC.md` — structured: (a) the 136-corner taxonomy (buckets + counts + why + Section consequence), (b) the 4 marks each classified with a labelled proxy + the exact op + root, (c) the shared-vs-distinct verdict, (d) the fix loci ranked. **Final summary message:** each artifact class in one sentence, the exact op(s) (`file:line`), the root(s), and the single highest-leverage next move.

## Boundaries
Read-only. No code/canon/bake edits. Proxies labelled as proxies; the operator's eye is the gate. Locate, don't fix. Kill any hypothesis the code refutes. If the 136 are *mostly legitimate* (straight/short corners that *shouldn't* have a handle) and only a small subset is a real bug, **say so** — don't inflate the problem.
