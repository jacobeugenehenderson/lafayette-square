# Correction-banners excised from the active docs — 2026-08-06

**Diary. One file for the whole banner-excision pass** (`BRIEF-excise-the-banners.md`, Quill). Not
authoritative — this is where the *false sentences* went, so the active docs could stop carrying them.

**Why this exists.** `CLAUDE.md §PRUNE AS YOU GO` (2026-08-06): *"a correction banner sitting next to the
false sentence it corrects"* is the anti-pattern — **excise the sentence**; the banner's job is done when
its subject is gone. A false claim outlives its correction because it is shorter and reached first. The
trigger was measured: on 2026-08-06 `tileGround.js`'s header comment *"the IX is never constructed"* —
which the Tier 2 sweep had already proved false and deliberately left in the file — was read and reported
to Jacob as a live finding.

⛔ **Nothing in this file is true.** It is the record of what was removed and why, so the removal is
auditable. For what IS true, follow the "live home" pointer on each entry.

---

## 1. `src/lib/tileGround.js` header — *"the IX is never constructed"*

**Removed (header step 3, `:26`):**

> The intersection fills where the tiles meeting at a node each contribute their asphalt — **the IX is
> never constructed.**

**Falsified by:** `[E3.2] THE JUNCTION CONSTRUCTION` in the same file — it consumes
`ribbons.junctionMap`, trims runs back by a window, welds the continuity pair at a shared curb point and
lays one apron per node; `[E3.3]` then constructs the corner identities off it. Generalized from a
censused node list to every node on 2026-06-07 (`9c275ce`). Coverage check:
`node -e "const r=require('./src/data/ribbons.json');console.log(r.junctionMap.nodes.length)"`.

**Live home:** the corrected `tileGround.js` header · `cartograph/SKELETON.md §5e`.

**Note for the record:** this comment was load-bearing *outside* its own file —
`OSM2STREETS-GROUNDING §2/§3.2` quoted it verbatim as evidence of a live architectural divergence from the
field standard. A false comment in source is not a local problem.

---

## 2. `cartograph/OSM2STREETS-GROUNDING.md` — the 2026-08-04 ACCORD BANNER and the four claims it corrected

The banner is gone because its four subjects are gone. What the banner said, preserved:

1. **§3.1 "the 18th mis-pair" was presented as a live bug; it is FIXED.** On the committed skeleton
   `south-18th-street-1` is `motorway_link`/`single`/`pairKey null` and `-4` is `service`/`single`/`null` —
   neither the pairing nor the class flattening survives. The gate is `carriagewayGates` in `skeleton.js`,
   run data-first, `scoreOnewayPair` demoted to confirmation. The genuine pair (`-5`/`-6`, both
   `secondary`) still pairs.
2. **§4.2 recommendation 1 was described as unported; it is substantially LANDED.** The only surviving
   sub-clause is *"tighten 60 m toward a plausible median ceiling"* — `DIVIDED_MAX_GAP = 60` unchanged.
3. **§4.2 recommendation 2 ("intersection-everywhere") was called the big remaining architectural item;
   it is largely LANDED** (`9c275ce`, junctionMap generalized). `SKELETON §5e` was right and this doc was
   the stale side of the contradiction. What genuinely remains is apron *geometry* coverage, not the map.
4. **§2/§3.2 rested the "defining divergence" verdict on the stale `tileGround.js` comment** in entry 1.

**Also excised from that doc, as superseded framing rather than fact:**

- The §3.1 forensic table (raw ways `28522831` `motorway_link` / `166624144` `service`, both named "South
  18th Street", fabricated `chainGap: 3.21`) and its "Dissolves under the standard? Yes" disposition. The
  *rule* it bought — **geometric similarity is confirmation, never detection** — is kept in the live doc.
- §3.2's "two honest deltas" paragraph, whose delta (a) — E3 stamps ~86 census-selected nodes vs. the
  standard's every node — was closed by `9c275ce`. The *lesson* is kept live: **a censused exception list
  is a coverage bug wearing a fix's clothes.**
- §2 rows asserting ours is "at 50 stamped nodes" / "a stamped exception list". Replaced with the command
  that re-derives coverage, per `CLAUDE.md §PRUNE AS YOU GO` rule 1.

**Live home:** `cartograph/OSM2STREETS-GROUNDING.md` (kept as a grounding reference; §1/§2/§4.3 are the
live part) · `cartograph/SKELETON.md §5e` · `cartograph/RIBBONS.md §1` for the still-open apron question.

---

## 3. `cartograph/RIBBONS.md §1` DOCTRINE — the pointer to the deleted comment

**Removed:** *"This **supersedes the old `"the IX is never constructed"` line** (`tileGround.js:26`)."*

Deleted rather than repointed: once the false sentence is gone, a note recording that it was superseded is
itself a banner on a corpse. The doctrine it introduced — **construct the hard polygons, derive only the
simple block faces** — is untouched and stays in `RIBBONS §1`.
