> ⛔⛔ **RETIRED 2026-08-26 — THIS BRIEF'S CENTRAL PREMISE WAS MEASURED FALSE.**
> It framed 318 placements as a leaf-PROCUREMENT question. After the expedition (which
> correctly acquired nothing) and the fixes that followed, **33 remain — one scale pack for
> Chinese juniper.** The rest were a wrong CELL (`ARCHITECTURE §8a` — the pines read `simple`
> from a source with no needle vocabulary) and a missing MATRIX (`BACKLOG` 2026-08-26 —
> serviceberry cannot reach the `serrate_ovate` we already own).
> ⭐ **Kept for the METHOD, not the numbers:** the expedition's discipline — confirm every
> premise, acquire nothing until the join is proven — is what surfaced both root causes.
> ▶ Live homes: `arborist/BACKLOG.md` (2026-08-26) · `arborist/ARCHITECTURE.md §8a`.

---

# BRIEF — leaf-pack expedition: find the leaves that turn red lights green

You are a **fresh agent**. Read `CLAUDE.md`, then `ORIENTATION.md`, then
`arborist/ORIENTATION.md`. ⛔ **This brief's premises are CLAIMS — confirm them against the
code and say what you found before acquiring anything.**

## The job

Find leaf packs (scans / textures) we can legally use, so species currently RED for want of
a leaf become green. **Report what you found and where it came from. ⛔ Do NOT compose, do
not edit dossiers, do not publish.** Acquisition and authoring are different jobs and this
is the first one.

## What we already have — check before you go looking

18 packs in `public/textures/leaves/shapes/<name>/{shape.png,meta.json}`.
▶ `node -e "…"` over that directory, or read `public/library/leaves/`.

⭐ **Coverage should come from COMPOSITION, not procurement** (`arborist/ORIENTATION.md:24`).
A species is only a real gap once the MIXER cannot dress it from parts we hold. So for every
species below, first ask whether an existing pack is honestly right — a bur oak and a white
oak can share a lobed pack. **Procure only what composition cannot reach.**

## The measured gap (re-derive; do not trust this table)

```
node -e "import('./arborist/roster-coverage.js').then(async m=>{const c=await m.computeCoverage();
  for(const s of c.species) if(s.authoringState!=='composed' && s.forestBuilder?.parts?.leaf?.status!=='have')
    console.log(s.count, s.species, s.forestBuilder.parts.leaf.status)})"
```

At the time of writing, 5 red species have a leaf that is not `have`:

| placements | species | leaf |
|---|---|---|
| 115 | Cypress, Bald | stretch |
| 70 | serviceberry, downy | gap |
| 55 | Pine, White | gap |
| 45 | Pine, Austrian | gap |
| 33 | juniper, Chinese | gap |

⭐ **Four of five are CONIFERS**, and we hold exactly two needle packs (`long_needle`,
`short_needle`) against pine, spruce, fir, cypress, juniper and bald cypress — which are
not interchangeable to the eye. That is the shape of the gap; treat the table as a starting
point, not the scope.

## ⛔ THE RULES THAT ARE NOT NEGOTIABLE

- ⛔ **Licence first, asset second.** Record the licence and the attribution for EVERY
  candidate BEFORE proposing it. CC0 / CC-BY / an explicit commercial licence. No
  "probably fine".
- ⛔ **Oregon State is never fetched** (robots: ClaudeBot `Disallow: /`). Morton / Missouri
  Botanical Garden: **schema shape only, never content** — non-commercial, no download.
- ⛔ **Nothing is mirrored in bulk.** Take the facts and the URL, never the compilation.
- ⛔ **Do not download anything into the repo** without Jacob's say-so. Propose with URLs,
  licences and a size estimate; he decides.
- ⛔ Everything you create lives **inside the project**. Never `git add -A` — this is a
  shared worktree.

## ⭐⭐ WHAT A USABLE PACK IS — the part that just cost us a day

A pack is `shape.png` + `meta.json`. `meta.tileGrid` is `[cols, rows]` and
`generate-salon`'s `rewriteCardUVs` assigns a cell **PER CARD AT RANDOM**.

> ⛔ **THEREFORE EVERY CELL IN A PACK MUST BE THE SAME LEAF IN THE SAME SEASON.**

`eastern_black_oak` is a 2×2 of four arbitrary scans — one green, three autumn — so every
white oak on the map drew a roughly 3:1 RED canopy. 531 placements. It took the operator's
eye to catch, after two wrong explanations from a coordinator who had "measured" the pack's
mean colour and read it as green: an average across one green cell and three red ones is not
a measurement of anything.

▶ **`node scratch/claims-leaf-pack-cells-agree.mjs` — run it on anything you propose.**
It samples each cell's HUE and fails a pack whose cells disagree. **5 of our 15 multi-cell
packs fail it today.** A pack that fails is not a candidate.

⭐ Prefer **single-cell packs, or a source with enough scans that we can curate one season
ourselves.** More cells is not better; more *consistent* cells is.

## ⭐ NOMENCLATURE — use the botanica, it is the industry speak

Every pack's `meta.json` carries `morphology` (one live rubric term) and `leafAxes`
(`leaf.shape` / `leaf.margin` / `leaf.type`). ⛔ **Do not invent vocabulary.** The live terms
are in `arborist/rubric.json`; resolve with `arborist/vocabulary.mjs`.
⚠️ `star` and `fan` were RETIRED 2026-08-25 — sweetgum is `orbicular` + `lobed`, ginkgo is
`flabellate`. If a source's word does not resolve, that is a finding to report, not a licence
to coin a term.
⭐ **`palmate` is the trap**: a maple leaf is SIMPLE and palmately LOBED
(`orbicular` + `lobed`). `compound-palmate` means separate leaflets — horse chestnut, not
maple. Getting this wrong mislabels three packs and every maple downstream.

## Deliverable

One report: per candidate pack — **source URL · licence · attribution · what species it
serves · cell consistency · the rubric terms it would carry**. Rank by placements unlocked.
⛔ Say plainly which gaps you could NOT fill; an honest "nothing usable for Austrian pine"
is worth more than a marginal candidate.

## Working rules

- ⭐ **A number you did not measure is not a number.** Re-derive the gap table.
- ⛔ **Never write the EXPLANATION of a number — only the number.** If a mechanism is not
  measured, write **"cause not established"** and stop.
- ⭐ Prefer sources that publish a species name with the scan — it lets `vocabulary.mjs`
  verify the identity instead of us trusting a filename.
