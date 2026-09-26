<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: the two measurements below exist as re-runnable checks, and Jacob has ruled on what each shows. The fix, if any, is a separate brief.
-->

# Tree density and tree size — a disciplined measurement

**You are the dispatched agent. Name yourself — one word, yours, and NOT one already used.** Before taking a name, check it is unused in both the commit log and the docs: `n=YourName; git log --all --format=%B | grep -icw "$n"; grep -rliw "$n" --include='*.md' . | grep -v node_modules | head` — both must come back empty. ⛔ A repeated name (two agents called Tern) makes the record ambiguous.
**Agent: FRESH** — this is a forensic; it needs a whole context and no prior conclusions.

## The ask

Jacob, 2026-09-26: *"Provincetown's trees are too sparse, but also seem possibly too large. We need to do
a disciplined tree size analysis."*

⛔ **Measurement only. Change no placement, no species, no size.** The deliverable is two re-runnable
checks and a short report to Jacob. Provincetown is where it was seen; ⛔ the checks must run on **every
poured town** (Layer 0 — a finding true only on Provincetown is not yet a finding).

## What Boz measured (2026-09-26 — re-derive, don't quote)

- `cartograph/data/provincetown/clean/derived_trees.json` holds **42,889** candidates; `public/baked/provincetown/trees.json` places **6,109** (**14%**). Huron places ~87% of its 21,505. ⇒ something drops 86% on Provincetown.
- Provincetown's placements are 23 `osm` + 6,086 `derived`; top species pitch pine 1,868, black oak 1,022, scarlet oak 902, white oak 765, red maple 674.
- Provincetown's instances carry **no `scale` and no `dbh`** (LS's do) ⇒ every tree draws at its species' default size.
- ⚠️ `clean/osm_trees.json` (48 trees) is untracked in git while huron's is tracked — probably an omission from `c2a91e86`; tell Jacob, don't commit it yourself.

## Read first

- `arborist/ARCHITECTURE.md` — **"Tree-render reality at LS"** and the size rules (`bandFor`, `normalizeScale`).
- `arborist/BACKLOG.md` — **"A SPECIES HAS TWO SIZE WINDOWS, AND THE TOWN PICKS ONE"** (2026-08-28). ⭐ This is the likely frame for "too large": street-grown vs forest-grown height, chosen per installation. It touches the rubric keystone and **needs a standup before any build** — you are measuring for it, not building it.
- `cartograph/BAKE.md §4.5/§4.6` (a census is the union of its wells; the tree gates) and `ROADMAP` **H-17** (the ruled real-where-real, extrapolated-where-necessary pattern; surveyed is nudged, invented is dropped; the dissolve).

## Code sites

- `arborist/bake-trees.js` — the gates in order (disc/membership, the fade-band dissolve, water, `lu-policy`, forbidden surface), `pickVariant`, `bandFor`, `SOURCE_BY_BASENAME`. The bake log already prints drops; start there.
- `arborist/publish-glb.js#normalizeScale`, `arborist/mature-heights.json` (the 25 m stopgap), `arborist/dossiers/<id>.json` and `scratch/dossier-raw-observations*.jsonl` (both street and forest heights, per species, with provenance).
- `cartograph/lu-policy.mjs` + `data/<scene>/lu-policy.json` (the per-town tree dial).

## The two measurements

1. **Density — where do the candidates go?** Per town: candidates in → count dropped at each gate, in order → placed. A gate that takes most of one town's trees and little of another's is the lead. ⛔ Do not assume the disc: Provincetown's fetch rectangle is large against its circle, so "outside the disc" may be most of it — measure it.
2. **Size — what height is each tree drawn at?** Per town, per placed species: drawn height (the height the runtime actually renders, including `normalizeScale` and any band) against the dossier's **street** figure and its **forest** figure. Report which window each town is effectively using.

## The chain

Upstream you trust: the census wells (`clean/osm_trees.json`, `clean/derived_trees.json`) and the dossiers.
Downstream that trusts the numbers: `trees.json` → `InstancedTrees` → the phone budget (Column B).
A density change moves the frame rate; say so in the report.

## Can the instrument see it?

Read the artifacts on disk (`trees.json`, the census files, the GLBs' bounding boxes), not the live
render — and check the timestamps: a `trees.json` older than its census is not measuring the census.
The eye gate at the end is Jacob's, on Provincetown in Preview, scene recorded.

## Bounds

- Write only new checks under `checks/` (each prints its own counts, reads its inputs from source rather than restating them, and is mutation-tested once).
- No edits to `arborist/` or `cartograph/` code, no bakes, no canon edits beyond one `ROADMAP` line pointing at the checks.
- Commit message says "reaches no register".

**The instruction is confirm-then-build:** read the canon and the code, tell Jacob what you found, and if
the code contradicts this brief — stop and flag him.
