# Co-journal — Hero Pan, trees, and the night-LOD lever

**Date:** 2026-05-26
**Present:** Jacob + Boz (#2, running in parallel with Boz #1 — kept out of memory + uncommitted on purpose to avoid a parallel-write collision)
**Mode:** think-together, no dispatch. This is a thinking record to revisit, not a brief.

---

## Where this came from

We sat down to scope the **consolidation campaign** — the "brief for Boz" — that closes out the slab-became-three-apps tranche. Three intended items:

1. True up the docs to the *finally chosen* state and make them accessible/relevant.
2. Molecular doc-vs-code comparison → rip out vestigial code, fortify what remains.
3. Security + steam-clean brief.

En route we hit a realization worth banking before we move to the bigger fish.

---

## The realization (the heart of this entry)

**It's trees + the Hero Pan. Everything else is fine even with the pan.** That's the whole cost locus; spending cleverness elsewhere is misallocation.

**The Hero Pan (180° arc) is the root complexity generator.** Mechanically: the cheap mobile tree solution is a single camera-facing billboard impostor — bake from one angle, nearly free, looks perfect. That solution *dies the instant the camera pans*. A 180° arc means trees at left and right of frame need different impostor angles simultaneously, and any single billboard shears/rotates as the camera sweeps. So the pan is exactly what forces multi-view impostors, analytic occlusion, atlas re-use — the entire `HANDOFF-tree-hero-lod` arc. The brief is *literally named* "pan-arc impostors." Trees are the dominant mobile GPU cost; the pan is what makes them un-cheap. The pan is also (transitively) what keeps the hardest in-flight arc open, which gates the docs truth-up. One design choice, blocking both perf budget and finalization.

**Doctrine invoked (Jacob: "when in doubt get smart not cheap"):** the answer is NOT "kill the pan to save perf." Never cut visual to get smallness — the resolution is cleverness, not compromise. If the pan is signature, the impostor arc *is* the clever resolution.

**The night lever (Jacob's, and it's sharper than a halving).** ~50% of the day is night. At night, even while lit, trees don't have daytime light requirements. Push it through the pan logic: the multi-view rig exists *only* to preserve view-dependent shading as the camera arcs — migrating highlights, normal-driven shading, self-shadow. That's all high-contrast, directional-light behavior. Night light is flat, low-contrast, ambient-dominated (moon + streetlamp pools + neon glow) — the thing the rig pays for **isn't visible**. So:

- **Day + pan** = genuinely hard. Full PBR, multi-view, relight. Irreducible.
- **Night + pan** = potentially *cheap* — few/one view, no normal channel — because there's no angular shading to lose.

Night doesn't just halve the cost; it may **dissolve the pan problem itself for the night half.** Full bar exactly where the eye can see it; collapsed rig exactly where it can't. Smart, not cheap.

---

## Actionable consequence — a PRE-DISPATCH brief amendment

`HANDOFF-tree-hero-lod.md` is committed (`923bd19`) but **not yet dispatched.** So this is cheap to fold in now, before an agent builds the rig.

Current brief specs **"color + normal + runtime-relight default."** The trap: *runtime-relight makes night **correct**, but not **cheap**.* "The full day impostor, relit dark" still pays for the normal channel + multi-view sampling at midnight, for fidelity nobody can see. Separate the two things the brief currently fuses:

- **Relight** = correctness *across* time-of-day (smooth ToD transition).
- **Night-LOD** = a *structurally cheaper path* at night (color-only, fewer/one view, flat ambient) — NOT the day path dimmed.

→ Re-cut the impostor rig around a **day-branch / night-branch** from the start (a time-of-day-gated tier, not only distance/visibility-gated), rather than retrofitting later.

**Adjacent lever, parked:** the same move exists in the *season* dimension — bare winter trees are mostly absent leaf-cards, fewer to draw. Night = the time-of-day version; winter = the calendar version. Same perceptual-budgeting principle, already implied by the phenology doctrine. Thread to pull later.

---

## OPEN — to settle before dispatch

1. **Is the Hero Pan a signature moment?** (Jacob's call — he's the eye.) Three shapes, *not yet answered*:
   - **Signature** → keep it; impostor arc is the right investment; dispatch.
   - **Negotiable arc-width** → 180° vs ~40° is night-and-day in cost; narrowing may collapse the problem without losing the *feel* of motion.
   - **Incidental** → if it's not earning its keep, removing it makes the whole hardest arc evaporate.
2. Does the **day/night split** match how Jacob sees the Hero moment actually lit?
3. Should the brief be **re-cut around day-branch / night-branch** before it goes out?

---

## Also banked from the campaign discussion (so the thread is recoverable)

- **Product stack is one stack, real at three heights:** LS = product that *ships*; the kit = product that *produces* (latent standalone future for Arborist/Meteorologist — SpeedTree answer — but *latent*, shapes structure not build); Jacob = product that *authors* (the irreducible eye). Unity doctrine in product clothes. Marketing differentiator = the nesting, not a thing to flatten.
- **Campaign spine (forced dependency):** docs truth-up is the *safety mechanism* for dead-code removal, not parallel hygiene — in this repo dead and load-bearing code are visually identical, and we've been bitten. Order: in-flight lands → docs truth-up → dead-code audit then removal → security + fortify. Whole campaign gated behind the in-flight arcs landing.
- **Deletion test is two-pronged** (maps onto the slab boundary): code is live if it serves an LS *render* claim, OR an LS *content* claim, OR *kit operation*. Dead = none of the three. Protects authoring tooling from false-cruft flags by construction.
- **The LS doc suite already EXISTS as a scaffold** — the "LS trinity" (`ls/FEATURES.md` / `ls/ARCHITECTURE.md` / `ls/BACKLOG.md`) + `ls/reference/`. `ls/FEATURES.md` is the thinnest by 10× and its entire end-user-experience section is explicit `[TO BE FILLED]` stubs — i.e. the *claim-skeleton already exists as headers*. Job = fill + bulletproof a scaffold, not create. LS doesn't need the helpers' full suite (no giant NOTES/SPEC — its design history lives in cartograph/NOTES + root HANDOFFs); right size = trinity filled + product/experiential body the helpers lack + reference/ inventories trued.
- **Recon for #2/#3 partly already done:** `ls/reference/INVENTORY-DATA.md` + `RUNTIME-DELTA.md` already hold a keep/strip ledger + "sterilize surface"; `plans/pre_public_cleanout.md` (38 KB) is a prior cleanout plan. Consolidate + execute, not cold start.
- **Security surface is bigger than the surmised "hours DB, no sensitive info"** (verify-before-assert, confirmed by `ls/reference/INVENTORY-API.md`): GAS w/ 40+ endpoints incl. **admin-passphrase edits across all listings**, Supabase auth + RPCs + edge functions + realtime (Cary, chat), plus **residence/guardian ownership claims** = real write paths + identity + ownership. Security brief must scope to *that*. (Kit `serve.js` backends are local/single-operator — only become a public surface if the kit graduates.)
