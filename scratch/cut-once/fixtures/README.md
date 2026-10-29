# BRIEF-cut-once-in-full-precision §3.1 fixtures

Copied or derived on 2026-10-28 by Plumb, read-only. The source is `.claude/worktrees/shore` (slated for removal), whose PTown coast is the v5 that Swash's gates ran on (Boz). Its coast code matches integration 9b9910bb byte for byte (structures, bake-coast, coastFile, mintInputs, latticeNode).

| file | from | md5 of source |
|---|---|---|
| ptown-coast.json | shore/cartograph/data/provincetown/clean/coast.json (copied) | 1bcc6f015caa41b2191295998015dca6 |
| ptown-deck-inputs.json | structures.mjs#deckInputs over raw/osm.json (derived; source not committed, 22 MB) | 9d35836f36c61e8de5b1b98fb60ffa03 |
| ptown-street-decks.json | streetDecks over mintInputs' streets: ribbons.json (34 MB, not committed) + skeleton.json (2.7 MB, not committed) | ribbons f39159fdcebddf7fd71b147ee7fd4bb7 · skeleton 427406301faf1b758d06b61aa15af2a0 |
| ptown-embankments.json | embankmentFootprints over skeleton.json (+ references/registry.json) | skeleton as above |

Also read: geography.json 7313ad4af60ebe6894a86378c0b7017c, neighborhood_boundary.json 8053dd2bf95e4c48f492c0758ed2700a; PTown's home Look `provincetown` (src/instances/provincetown.js).

Regenerate: `node scratch/cut-once/extract-fixtures.mjs --data=<that dir> --town=ptown --scene=provincetown --at=282.795,113.216`

Reproduces: 4 street decks · footprint edges ≤ 2 mm: 10 · take-out edges ≤ 2 mm: 58, all on deck edges · the 1 mm back-step at (282.791, 113.214) → (282.791, 113.213) on deck 1 (MacMillan Wharf / Lopes Square), 4 mm from the brief's (282.795, 113.216), which is ①'s, downstream; offset cause not established.

## Huron's traced water (`huron-traced.json`, 1.6 MB)
`traced` in bake-coast.mjs, the input to `openCloseAtStep(traced, fine, 'the traced water', { cutOnce: false })`, in clipper units (scale 1000), with fineM and the square. Written by `scratch/cut-once/bake-coast-traced.mjs`: bake-coast.mjs at integration 9b9910bb, its imports repointed to the integration worktree, `write: false`, exiting right after `traced`. Run under Boz's heavy slot in 75 s, from `.claude/worktrees/integration` (`node ../plumb-cut-once/scratch/cut-once/bake-coast-traced.mjs --scene=huron`). Huron's clean/coast.json md5 before and after: e65e1dbd2b1c2086fc793809ff89ff55.
Verified by `node scratch/cut-once/verify-huron-traced.mjs <huron coast.json>`:
- `cutOnce: false` reproduces coast.json's record exactly (3.059 / 34.181 m², 41 / 75 features, the same sliver counts).
- `cutOnce: true` reproduces the debt: (-4820.83, -3834.455) is a vertex its output passes 3 times, with 113 repeated vertices in all.
