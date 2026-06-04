# HANDOFF — Band-fold fix (Roots A+B): LOCAL capacity clamp (Option A)

**State:** dispatch-ready — **sequence AFTER §Wall lands** (shares `tileGround.js` with Chord). **Agent: WARM → Bollard** — it authored the forensic (`HANDOFF-junction-band-thorns-FINDINGS.md`) and pinned the `iW`-fold mechanism op-by-op; this is "build the fix you scoped." **Domain:** cartograph SHAPE — `src/lib/tileGround.js` `sectionPass` (the concentric ped-band offsets). **Decision:** **Option A (PREVENT — local clamp)** confirmed by Jacob 2026-06-04, over Option B (repair/trim).

> **Read first:** your own `HANDOFF-junction-band-thorns-FINDINGS.md` (the diagnosis) + `RIBBONS §3.9a` item 5 (the capacity-guard doctrine — the thing we're making local). Don't re-derive the diagnosis; build the fix.

---

## The diagnosis (yours — verified, don't re-derive)

Roots **A** (T-mouth band-fold, ~69/115) + **B** (thin-tile / real-stagger, Waverly, ~46/115) share **one** fix. At a **local neck** where the tile's inscribed reach < band depth `WB = cw+tl+sw (≈3.95 m)`, the **deepest offset `iW = offsetRings(iA, −WB)` folds** (76–180° sidewalk reversal). The per-tile capacity guard (`tileGround.js:936-938`) **sleeps** because the tile is **globally in-spec** (`cap == WB`, not clamped) while the **local** neck folds. Join-independent (not a miter artifact). Corner-R is a mechanism clue but **global R is a wash** → the lever is **local**.

## Governing doctrine (what makes this sanctioned, not a hack)

- **`RIBBONS §3.9a` item 5 — "degrade to a clean truncated ribbon"** when the band exceeds inscribed reach. **This fix = that guard, made LOCAL** (the existing guard is global/per-tile; you extend it to the local neck — the documented G12 partial-degeneracy completion).
- **NOT** `§6.9` point 5's superseded "self-intersection is signal, not error" — that was the *figure-ground* corner-pad stance; the tile model already chose **truncation** (G12). You're consistent with current doctrine, not reviving cusp-scaling.
- **NOT** a constructed corner primitive (RIBBONS invariant #1), **NOT** a join change (#2 — you proved join-independence), **NOT** a corner-R clamp (`feedback_no_corner_radius_clamps_in_emit`).

## The fix — Option A (PREVENT, local clamp)

Per your own written fix-direction: **detect the local neck (local inscribed reach < band depth) and clamp the offset depth THERE**, so the deep band **degrades to a clean truncated edge** (meets the avenue flat) instead of folding past the medial axis. One mechanism, both roots (A = T-mouth neck, B = thin-tile neck — both are "local reach < depth").

- **The hard part = a LOCAL reach measure** (the construction question you flagged). A per-tile `cap` over-clamps the in-spec rest of the block, so the clamp must be local/variable. Starting candidate (you prototype + pick): per-vertex **distance to the nearest non-adjacent `iA` edge** (a cheap local-width proxy) → where `local_half_width < WB`, clamp that region's offset depth to `~0.9 × local_half_width` (mirrors §3.9a item 5's 90% rule, applied locally). A medial-axis measure is the rigorous version if the proxy is too coarse — your call after prototyping.
- The deep offset should **truncate to a clean edge** in the clamped region, not fold; shallower offsets (`iC`/`iT`) are untouched where they're in-spec.

## ⛔ No-regress gates

- **Only the local neck is treated** — in-spec blocks + legit 90° corners untouched (the global guard's full-collapse path stays; you ADD the local/partial case).
- **Preserve R=0 ADA squares** (jtMiter; no rounding).
- **Don't touch the cul-de-sac wrap** (`deadEndTips` gates `nodeDeg===1`; T-mouths are deg-3 — Mackay's real round end keeps its wrap).
- **Don't confuse a divided-carriageway median sliver with a thorn** — the **Truman south-of-Park median is a SEPARATE D3/D8 thread** (`TRUMAN-FORENSICS.md` addendum); do not touch it.

## Validation (evidence-before-excision; Jacob's eye is the gate)

- **Prototype in your worktree**, validate on the **production `buildTileGround` path + the live :5173 Survey wireframe** (not a proxy rasterizer — `feedback_proxy_render_is_not_the_operator_eye`).
- Jacob's eye: the **clean-T thorns gone** (Vail/Park, Kennett/Mississippi, Mackay/Park, Albion/Missouri) **+ Waverly (Root B) gone**; in-spec blocks + legit corners + R=0 squares **unchanged**.
- **Map-wide reversal count before/after** (your `bandcount` harness; baseline ~414–432) — must **drop substantially**, not be a wash. Reuse `scratch/bollard-*.mjs` (`offset`/`jx`/`scan`/`bandcount`/`corner`).

## Coordination / boundaries

- **`tileGround.js` `sectionPass` = same file as Chord's §Wall sub-step-2** (arc-length smooth). **Dispatch AFTER §Wall lands + merges to trunk** — then this runs **parallel to the name-logic skeleton pass** (`skeleton.js`, different file → no collision).
- Branch off the **§Wall-inclusive trunk**, own worktree (`isolation: "worktree"`).
- **Edit `tileGround.js` only** + re-baked artifacts. Canon off-limits — Boz folds after it lands. **HOLD the integrated bake; coordinate with Boz.**
- Report: before/after reversal count + the named-junction dispositions + R=0 spot-check.

## On landing (Boz)

- Fold into `RIBBONS §3.9a` (local capacity clamp = the partial-degeneracy completion of the G12 guard); **flip the ledger G12 row → DONE (local clamp)**; re-test the dead-end **Missouri Ave** flood on the fresh topology; retire the junction-band-thorns forensic + this brief → NOTES.
