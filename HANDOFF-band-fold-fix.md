# HANDOFF — Band-fold fix: LOCAL capacity clamp (Option A), across all three offset layers

> **⭐ Absorbs (2026-06-22):** Bollard's op-by-op forensic `junction-band-thorns-FINDINGS` folded here → `cartograph/_archive/handoffs/` (the Roots A/B mechanism + the 115-junction census; the name-logic sub-root it surfaced went to `SKELETON.md §5`).

> ⚠️ **MECHANISM SUPERSEDED by the build (`band-fold-fix@8e1e414`).** The agent verified in the live geometry that **Clipper offsets do NOT fold** — they *split* rings cleanly. The "offset folds at thin necks" premise below (and Option A's depth-clamp) is therefore **wrong**. The real roots: **degenerate `iA`** (12 sliver/acute tiles) propagating to the asphalt/curb artifacts, + **union folds** (overlapping per-tile contributions). The fix that landed = **iA-regularize-at-source + whole-layer `SimplifyPolygons` hygiene** (+ a scoped ρ=0.5 morphological open on irreducible residuals). Results: 4 marks dead, SELFINT 59→0, handles/footprint preserved. **Pending Jacob's :5173 eye-gate, then canon fold (RIBBONS §3.9a/§6.3) + a rewrite of the diagnosis below.** Read the brief for structure/scope; trust the build for mechanism.

**State:** **dispatch-ready NOW.** The old "sequence AFTER §Wall lands" gate is **cleared** — Wall Phase-D landed (`ef460d1`); Chord's wall sub-step is done. Branch off clean trunk `cartograph-looks-pass-ab` @ `5658d43`, own worktree (`isolation: "worktree"`).
**Agent:** a cartograph **SHAPE** specialist. **Recommend Caliper** — it authored the current 4-mark op-by-op map (`scratch/SURVEY-CONSTRUCTION-FORENSIC.md`) and owns the live harnesses (`scratch/caliper-*.mjs`, `tg-instr.mjs`); this is "build the fix you just scoped." (Bollard authored the original mechanism diagnosis + `bollard-*.mjs` harnesses — same family, now on a different task.)
**Domain:** cartograph SHAPE — `src/lib/tileGround.js`, the inward-offset construction (the concentric ped bands, the curb stroke, the asphalt complement). **Decision:** **Option A (PREVENT — local clamp)** confirmed by Jacob 2026-06-04, over Option B (repair/trim). Still holds.

> **Read first (don't re-derive — build the fix):**
> 1. **`scratch/SURVEY-CONSTRUCTION-FORENSIC.md` (Caliper, 2026-06-08) — the CURRENT map.** §(b) classifies all 4 marks to exact ops + current line anchors; §(c) proves they're one internal class (band/offset self-intersection) distinct from the corner-registration gap; §(d) item 1 is this fix.
> 2. **`cartograph/_archive/handoffs/HANDOFF-junction-band-thorns-FINDINGS-FOLDED-band-fold-fix-2026-06-22.md` (Bollard, 2026-06-04) — the op-by-op MECHANISM.** Roots A (T-mouth fold) + B (thin-tile). *Note: its line anchors predate intersection-everywhere + the datum repair — trust Caliper's anchors below for line numbers, Bollard's for the mechanism.*
> 3. **`cartograph/RIBBONS.md §3.9a item 5** (the capacity-guard doctrine we're making local) **+ §6.3** (the 49 repo-wide SELFINT residuals this kills).

---

## The diagnosis (verified — don't re-derive)

A band/offset ring **folds** wherever the local corridor is too thin or too acute to hold the inward offset: the deepest inward offset reverses (76–180° sidewalk reversal) or self-crosses, and a self-intersecting ring **triangulates to an opaque blob** (RIBBONS §6.3: "SELFINT triangulates as opaque artifact" — Jacob's "overdraw" read is literally correct). Roots **A** (T-mouth band-fold) + **B** (thin-tile / real-stagger, e.g. Waverly) are the same fold at a **local neck** where the tile's inscribed reach < band depth.

**The guard that sleeps:** the per-tile capacity guard (`tileGround.js:2024-2041`) computes one `cap` from the tile's **whole-tile** inscribed reach (bisect `iA`'s largest non-empty inward offset, freeze `cap = 0.9 × reach`). It is **blind to a *local* neck** — when the tile is globally in-spec (`cap == WBnom`) but one mouth/pinch folds locally, the guard never fires. The lever is **local**, not global (global R / global cap is a wash — Bollard proved it).

### The 4 marks span THREE offset layers (Caliper — this is the scope change)

The original brief scoped only the ped band (`iW`). Caliper's forensic shows the same fold mechanism on all three inward-offset products:

| # | centroid | layer | exact op (current anchor) | flavour |
|---|---|---|---|---|
| **1** | `[177,202]` (park, Mississippi×Lafayette) | **ped band** | `iW = ringAt(TLmax+SWmax)` → `offsetRings(iA, −key, bandJoin)` (`:653`, via `ringAt`/`:651`) | `iW`-fold at a **T-mouth neck** — Root A |
| **2** | `[706,302]` (east) | **ped band** | same `:653` | `iW`-fold into a detached self-intersecting **teardrop loop** — textbook reversal — Root A/B |
| **3** | `[−344,−244]` (southwest) | **curb stroke** | `Cacc = differenceRings(iA, offsetRings(iA, −min(cw,cap), bandJoin))` (`:2043`) | shallow `iC` offset folds → a thin **curb needle/spike**; a coincident-fill-seam needle survives into a larger ring |
| **0** | `[450,−92]` | **asphalt complement** | `Aacc = differenceRings([tile.ring], iA)` (`:2042`; unioned `:2075`) | acute-junction **asphalt finger/wedge** — `iA` self-crosses where two stadiums meet at a shallow angle |

## Governing doctrine (what makes this sanctioned, not a hack)

- **`RIBBONS §3.9a` item 5 — "degrade to a clean truncated ribbon"** when the band exceeds inscribed reach. **This fix = that guard, made LOCAL** (the existing guard is global/per-tile; you extend it to the local neck — the documented G12 partial-degeneracy completion).
- **NOT** `§6.9` point 5's superseded "self-intersection is signal, not error" — that was the *figure-ground* corner-pad stance; the tile model already chose **truncation** (G12). You're consistent with current doctrine, not reviving cusp-scaling.
- **NOT** a constructed corner primitive (RIBBONS invariant #1), **NOT** a join change (#2 — join-independence proven), **NOT** a corner-R clamp (`feedback_no_corner_radius_clamps_in_emit` — clamp the offset W, never the fillet radius).

## The fix — Option A (PREVENT, local clamp)

**Detect the local neck (local inscribed reach < band/offset depth) and clamp the offset depth THERE**, so the deep band **degrades to a clean truncated edge** (meets the avenue flat) instead of folding past the medial axis. One mechanism for the fold class — but it lands at **three loci**, and the asphalt one is NOT a literal depth clamp (read on).

- **The hard part = a LOCAL reach measure** (the construction question Bollard flagged). The per-tile `cap` over-clamps the in-spec rest of the block, so the clamp must be **local/variable**. Starting candidate (prototype + pick): per-vertex **distance to the nearest non-adjacent `iA` edge** (a cheap local-half-width proxy) → where `local_half_width < depth`, clamp that region's offset to `~0.9 × local_half_width` (mirrors §3.9a item 5's 90% rule, applied locally). A medial-axis measure is the rigorous version if the proxy is too coarse — your call after prototyping.

- **Ped band (`:653`, marks #1/#2):** the literal Option-A target. Clamp `iW`'s depth at the neck so the deepest offset truncates instead of folding; shallower offsets (`iC`/`iT`) untouched where they're in-spec.
- **Curb stroke (`:2043`, mark #3):** the curb is `iA − offsetRings(iA, −min(cw,cap))`. Same local-neck logic on that `cw`-depth offset → the curb truncates at the neck instead of the `iC` offset folding into a needle. (Watch the **coincident-fill-seam needle** the `:1989-1993` comment names — a zero-width seam that today only drops when `<0.5 m²`; the local clamp should subsume it.)
- **⚠️ Asphalt complement (`:2042`, mark #0) — NOT a depth clamp.** `Aacc = tile.ring − iA` is a **complement, not a depth offset** — there is no depth to clamp. The fold lives in **`iA` itself** self-crossing at the acute junction, then propagating into the difference as a thin self-intersecting finger. Two honest options for the agent to weigh after prototyping: **(i)** regularize `iA` at the acute neck (the same local-reach measure, applied to `iA`'s own construction so it can't self-cross), or **(ii)** a post-difference self-intersection cleanup on the `Aacc` ring before union (`:2075`). **(i) is preferable** (prevent, consistent with Option A's PREVENT stance) if the local-reach measure transfers cleanly to `iA`; **(ii)** is the fallback if `iA` must stay as-is for the curb/ped offsets that derive from it. **Flag which you chose and why** — this is the one locus where "extend the same clamp" is a simplification, not the literal mechanism.

## ⛔ No-regress gates

- **Only the local neck is treated** — in-spec blocks + legit 90° corners untouched (the global guard's full-collapse path stays; you ADD the local/partial case).
- **Preserve R=0 ADA squares** (jtMiter; no rounding).
- **Don't touch the cul-de-sac wrap** (`deadEndTips` gates `nodeDeg===1`; T-mouths are deg-3 — Mackay's real round end keeps its wrap).
- **Don't confuse a divided-carriageway median sliver with a thorn** — the **Truman south-of-Park median is a SEPARATE D3/D8 thread** (`cartograph/_archive/TRUMAN-FORENSICS.md` addendum); do not touch it.

## ⛔ NOT in this brief — distinct roots, do not bundle (false-corner discipline)

- **The no-mouth-side dogleg** (the old §"2nd facet" in this brief): "construction puts a corner where the centerline is straight" at a deg-3 T. **Different root** — keying/construction, not a fold; Option A's clamp won't touch it. It is **likely already resolved** by the landed **datum repair** (`8452c31`, Vernier — reconciled colinear through-fe `pavementHW` widths upstream, the THRU datum step) and/or **intersection-everywhere** (`9c275ce`). **Do not fix it here.** If the operator's eye still flags it after those landings, it belongs with the skeleton/junction work, not the band-fold clamp.
- **The corner-registration gap (~77 handles).** Caliper §(c): DISTINCT code root (apex→tile-node re-keying at `:2004-2008`), Survey-handle-only. Separate brief.

## Validation (evidence-before-excision; Jacob's eye is the gate)

- **Prototype in your worktree**, validate on the **production `buildTileGround` path + the live :5173 Survey wireframe** (not a proxy rasterizer — `feedback_proxy_render_is_not_the_operator_eye`; Caliper's proxies are labelled-proxy only).
- **Jacob's eye — the 4 named marks gone:** #1 `[177,202]` (ped T-mouth, park Mississippi×Lafayette) · #2 `[706,302]` (ped teardrop, east) · #3 `[−344,−244]` (curb needle, SW) · #0 `[450,−92]` (asphalt wedge). Plus the original clean-T thorns (Vail/Park, Kennett/Mississippi, Mackay/Park, Albion/Missouri) + Waverly (Root B). In-spec blocks + legit corners + R=0 squares **unchanged**.
- **Two map-wide counts before/after** — both must **drop substantially**, not be a wash: (a) the **sidewalk reversal count** (Bollard's `bandcount`, baseline ~414–432); (b) the **SELFINT band-ring count** (RIBBONS §6.3, baseline **49** repo-wide). Reuse `scratch/caliper-marks.mjs` (the self-int detector) + `scratch/bollard-*.mjs` (`offset`/`jx`/`scan`/`bandcount`/`corner`). ⚠️ Caliper flagged one map-spanning 480-pt asphalt ring whose crossings are at *other* distant junctions — a **red herring**; count the *local* flagged rings under the strokes, not that global ring.

## Coordination / boundaries

- **Edit `tileGround.js` only** + re-baked artifacts. Canon off-limits — Boz folds after it lands.
- **§Wall has landed** — no Chord collision. Runs parallel to the name-logic skeleton pass (`skeleton.js`, different file) and the corner-registration re-keying fix (`:2004-2008`, a different op in the same file → coordinate the diff if both dispatch at once, but no semantic overlap).
- **HOLD the integrated bake; coordinate with Boz.**
- Report: before/after reversal count **+ SELFINT ring count**; the named-mark + named-junction dispositions; the **asphalt-locus choice (i vs ii) with rationale**; R=0 spot-check.

## On landing (Boz)

- Fold into **`RIBBONS §3.9a`** (local capacity clamp = the partial-degeneracy completion of the G12 guard) **+ §6.3** (update the SELFINT residual count from 49 → the new floor); **flip the ledger G12 row → DONE (local clamp, all three layers)**.
- Re-test the dead-end **Missouri Ave** flood on the fresh topology.
- Retire `cartograph/_archive/handoffs/HANDOFF-junction-band-thorns-FINDINGS-FOLDED-band-fold-fix-2026-06-22.md` + Caliper's `scratch/SURVEY-CONSTRUCTION-FORENSIC.md` (the band-fold portion) + this brief → NOTES.
