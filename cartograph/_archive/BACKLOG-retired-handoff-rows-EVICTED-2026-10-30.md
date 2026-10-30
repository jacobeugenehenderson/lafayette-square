# BACKLOG §LIVE HANDOFFS: two struck rows (evicted 2026-10-30)

Evicted from `cartograph/BACKLOG.md`'s handoff table by Plumb, 2026-10-30: both were struck through and pointed at their own archive
already (the "RESOLVED, kept for context" anti-pattern). Their archives are unchanged.

| ~~animator-unify~~ | drop the animate toggle, always show ToD chips | ✅ **LANDED + RETIRED** → `_archive/HANDOFF-animator-unify-LANDED-2026-06-28.md`. The shipped behaviour is canon in `OPERATIONS.md §"How to operate any TOD channel"` (chips always on, no arming step). *(The 2026-06-30 "no landing evidence, verify-then-act" note was stale — the archive says landed 2026-06-28.)* |
| ~~boundary-trio~~ | circle-SSOT · crop-last · cull | ⛔ **SUPERSEDED 2026-07-21** → `_archive/HANDOFF-boundary-trio-SUPERSEDED-2026-07-21.md`. ⚠️ **Do not mine it for doctrine** — its "one idea" was *"the circle is the real boundary, derive the bbox from it,"* the baldest statement of the RETRACTED model in the repo, and it also called to "retire the manual toggles" (contradicting the durable per-building override). Live home: `EXTENT-DESIGN.md`. |
