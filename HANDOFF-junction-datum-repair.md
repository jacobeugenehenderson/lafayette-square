# HANDOFF — Datum repair: reconcile colinear through-fe widths (the no-mouth-side dogleg fix; E3.4 re-approached)

**Goal:** kill the **no-mouth-side T-junction doglegs** (the park-perimeter doglegs) at the **source** — the per-fe `pavementHW` **datum discontinuity** on physically-continuous avenues. Make a continuous avenue carry **one width** through a plain stem-T so the curb runs straight. **Frame/datum layer — NOT the drawing.**

**Agent: FRESH** (name yourself). **`isolation: worktree`**, general-purpose. *(Boz may do this directly — the brief is written to be dispatchable OR self-executable.)*

> ⛔ **DO NOT touch `tileGround.js`'s `[THRU]`/junction/corner construction.** Sextant's forensic proved the drawing is *correct*: it faithfully renders the width step, and it **self-gates** (`:1773`, `dw < 0.02 → continue`) when the step is zero. The previous **E3.4 attempt was reverted because it did `tileGround` corner-gate/G9 surgery and regressed the whole 18th corridor.** This re-approach is a **pure upstream datum reconciliation** — fix the data, the drawing fixes itself.

## Read first — the forensic IS the spec
- **`scratch/JUNCTION-FINISH-FORENSIC.md`** (Sextant) — the complete root-cause: the 5 nodes are `kinds:["plain"]` (no junction construction); the dogleg is `[THRU]` (`tileGround.js:1694–1800`) rendering an authored/seeded per-fe `pavementHW` step; the blend window is sized so the ramp sits at ~16.4°, **just under the 18° fillet tolerance**, so it stays a bare sharp Z-jog. Exact op `:1788`; the self-gate `:1773`. Verified steps: **Vail 0.66 m · Mackay 2.20 m · Albion 0.60 m** (Kennett/Waverly `dw=0`, already straight — they're the *separate* centerline-kink class, NOT this fix).
- **`BACKLOG` row `e3.4-datum-repair`** — REVERTED once, GOAL STANDS; "re-approach **surgically**: apply the width-data repair, **no corner-gate/G9 surgery**; verify curbs-move AND no-18th-regression BEFORE Jacob's eye."
- **`SKELETON.md`** (the base-width source: survey-seeded widths baked into the frame) · the custom-width KIT (`raw/survey.json`, 68 streets).

## The task
1. **Find the source of the per-fe step.** Trace where the avenue's flanking fe's get *different* `pavementHW` across a **plain through-node** (`junctionMap kind:"plain"`, avenue collinear through it): the seed (`cartograph/seed-centerlines.js`) assigning per-fe widths from `survey.json`, vs. `blockCustoms` in `design.json`. Sextant's lead: "typically one fe overridden / seeded and its colinear neighbour not." Confirm the exact source per the 3 stepped nodes (Vail/Mackay/Albion).
2. **Reconcile at the datum.** Where an avenue is **physically continuous** through a plain stem-T (collinear legs, `kind:"plain"`, no real width change intended), unify the flanking fe `pavementHW` to **one value** so `dw ≈ 0`. Decide the value deliberately and flag it for Jacob: the most likely intent is **the avenue's consistent surveyed width carries through** (propagate, don't step). ⚠️ Do **not** flatten *intended* width changes (a real divided/undivided transition, a genuinely different street) — gate strictly on "same continuous avenue through a `plain` node."
3. **Let THRU self-gate.** With `dw ≈ 0` the existing `[THRU]` code (`:1773`) skips the blend window and the curb runs straight — **no drawing change needed**.

## Gate (definition of done) — EYE, not proxy
- **Jacob's eye, live Survey:** the curb runs **straight** through Vail→Park, Mackay→Park, Albion→Missouri (and the unmarked worst, **park-avenue-1 right @ [−154,−220.9], dw=3.36 m**) — no Z-jog.
- **⛔ No 18th-corridor regression** (the E3.4-revert lesson — check it explicitly, on the eye, before declaring done).
- **Everything else byte-identical** except the reconciled fe's (the un-stepped avenues don't move). Machine A/B to confirm the change is confined to the stepped nodes.
- ⚠️ Sextant's numbers are proxy; the **live wireframe + operator's eye are the gate** (`feedback_shape_proofs_dont_gate_fill_geometry`).

## Boundaries
⛔ No `tileGround.js` junction/THRU/corner surgery (the drawing is correct). ⛔ Don't flatten intended width changes. ⛔ Don't touch the *centerline-kink* class (the separate ~93 off-chord stations → name-logic skeleton, different brief). ⛔ No canon-doc edits (report; Boz folds). Two-step rebuild + bake to verify; commit on your worktree; report what you reconciled + the value chosen + the 18th-check result.
