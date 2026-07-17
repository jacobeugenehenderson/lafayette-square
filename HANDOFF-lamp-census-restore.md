# HANDOFF — restore the 641 real streetlamps (census placement + re-bake)

**Agent: FRESH.** Route via `CLAUDE.md`. This is a **census/data-placement fix, not code** — the
render path is already live. Verified by forensic 2026-07-17. **Work in a worktree; docs→trunk.**

---

## THE FINDING (code-verified 2026-07-17)
Streetlamps render **fine** — they're just the wrong census. The runtime is fully wired:
`Scene.jsx:840` mounts `<BakedLamps/>` unconditionally → `BakedLamps.jsx` fetches
`baked/<lookId>/lamps.json` → `StreetLights.jsx` draws instanced victorian-lamp GLBs, with the
lantern/glow drivers in place. **No wiring gap, no render gap.**

The gap is a **misplaced raw file.** `bake-lamps.js:80` (`loadLampsForScene`) takes the OSM path only
if `cartograph/data/lafayette-square/raw/osm_street_lamps.json` exists. **It doesn't** — it was never
placed there. So the bake silently falls back (`:99-100`) to `src/data/street_lamps.json` = **80
procedural park lamps.** The **641 real OSM lamps** live at a *different* path:
`scripts/raw/osm_street_lamps.json` (git-tracked; structure already matches the parser:
`{elements:[{type:node, lat, lon, tags:{highway:"street_lamp"}}]}`, carries lon/lat → safe to
project through `geography.json`, no stale-frame trap). HPDM already has its file in the right place
(`cartograph/data/hipointe-demun/raw/osm_street_lamps.json`); LS is the one missing it.

> ⚠️ The `IS_MOBILE` commit (`7be5c567`) was a mobile-**mount** fix — it never touched the count. The
> 641→80 is an orthogonal **census** regression, still open. Do not credit it as fixed.

## THE BUILD
1. **Place the raw file** at `cartograph/data/lafayette-square/raw/osm_street_lamps.json` (the 641-node
   file currently at `scripts/raw/osm_street_lamps.json`). **Allowlist it out of `.gitignore`** so it
   survives a clean checkout — same doctrine the tree census used (`HANDOFF-ls-planting-LANDED.md:16`).
2. **Re-bake** LS lamps: `node bake-lamps.js --look=<look> --scene=lafayette-square` (or via the
   Designer bake chain, `serve.js:1868`). This projects 641 → `clipToBoundary` (some trim at the hood
   rim — expected) → re-anchors to ground → rewrites `public/baked/lafayette-square/lamps.json`.
3. **Commit** the regenerated `lamps.json` (+ the allowlisted raw file).

## DoD
- LS `lamps.json` `count` reflects the real (post-clip) OSM census — hundreds, not 80 — and the lamps
  read as a real street grid on **Jacob's eye** in the lit app (not just a count). Default look
  otherwise unchanged. ⛔ verify on the actual render, not the bake log.

*Quick independent win (ROADMAP §Quick wins) — no Front-A / Column-B dependency. Follow-on (separate,
backlogged): the lamp add/move/remove authoring affordance.*
