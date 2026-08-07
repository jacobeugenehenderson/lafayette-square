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

---

## 4. `cartograph/POLYGON-FIRST.md` — four banners, three of them corrections

**(a) §1 — "this section used to say the curb *is* the parallel offset, full stop."** Excised as
archaeology; the *warning* it carried is kept forward as **"'the curb is the parallel offset' describes
MOST blocks, not the map — check `producer` on the tile before you reason from it."**

**(b) §1 — the CORNER REGISTRY attempt's self-report.** Removed: the before/after table (228 → **261**
nodes · 695 → **769** corners · 160 `sameChain` · **50 of 50** caps with a `pendant-tip` · **6 of 6** blind
mouth corners), the "one list replaces two" design description, the Source 0b degree-2 note, and the
"stamp does NOT predict 8 constructed corners" open finding (513 fillet corners, 455 predicted, 50 map-edge,
8 away). **Every one of these came from `scratch/stamp-mouth-audit.mjs` or `scratch/stamp-predicts-fill.mjs`,
which `7b5b87a3` deleted while its own message said the probes were kept.** They are unreproducible; the
section stated that rule and then printed the numbers anyway, three screens further down.

⭐ Kept and restated forward as prohibitions: `corners.all` does not exist · do not quote the attempt's
numbers · a commit message is part of the corpus and nothing audits it · measure against a fresh
`pipeline.js` run, never the committed `ribbons.json` · **a width-step test is not a tip test** · **degree 1
alone over-counts dead ends on any town — the surplus is the envelope cut** · the dominant defect is
bounding, not existence.

**(c) §1 — "why the old count was wrong"** (the 46-of-49 → 50-of-50 archaeology: `hickory-street-1`,
`henrietta-place`, `south-22nd-street` measured 195 m / 154 m / 328 m from the cap). Excised. The two
method rules it bought are kept forward: **read the tip off the frozen `cap.vertexIdx`, never a FILL run's
span end**, and **a chain that caps twice in one tile must count twice** — with the observation that both
mistakes make the defect look *smaller*, which is why they survived.

**(d) §3 — "Corrected 2026-07-31: this table first read '32 median · 10 small'."** Left in place — see the
report; it sits inside a live reconciliation of three counts and cutting it risked a fifth over-swing.

**Live home:** `cartograph/POLYGON-FIRST.md` · `_handoffs/HANDOFF-deadend-face-resolution.md` §C0 ·
`_handoffs/HANDOFF-pipeline-reproducibility.md`.

---

## 5. ⭐ `CLAUDE.md` Layer 0 + `ORIENTATION.md` — the standing-evidence slot had expired. Twice.

**Removed from both docs:** the claim that **`ROADMAP` A07 is OPEN** — *"the code has two curb producers
and picks between them without telling anyone… at least 30 of LS's 101 tiles… its own comment says
'Falling back to legacy is never a regression'"* — cited at `tileGround.js:3326` / `:3347` / `:3345` /
`:3309`.

**Falsified by:** `ROADMAP A07` itself, which records **✅ CLOSED 2026-08-04 (`0464c136`)**. Every tile
carries `producer` + `producerReason` (`tileGround.js:3749`), the bake prints the split per pour,
degeneracy is loud and separate, and the *"never a regression"* comment is gone from the source. **All four
line numbers had also drifted.**

⚠️ **This is the pass's most important finding, and it is not a stale count — it is the gate doc failing
its own doctrine.** `CLAUDE.md` Layer 0 exists to prove *"no fallbacks"* with a live receipt, and its
footnote says in as many words: *"when you close a fallback, come back and re-arm this slot with a live
one — a doctrine whose evidence doesn't check out teaches agents to stop trusting the first read."* The
slot had then expired **a second time** (it previously cited `measureModel.js`, fixed 2026-07-31), meaning
the instruction was written and then not followed by the next closure.

**Re-armed with a receipt verified live 2026-08-06** — `POLYGON-FIRST §2.1` Check A,
`cartograph/litmus-curb-parallel.mjs`: `:77` still passes `blockCustoms: null` (runs with authoring OFF,
scores authored widths as defects — Layer 0 q3) and `:86` still reads `if (!tile?.iA?.length) continue`
(silently skips a tile with no curb ring, printing "no curb" as a modest bow — Layer 0 q2). Both checked in
the file, not quoted from a doc.

---

## 6. `cartograph/POLYGON-FIRST.md §3` — "prebake is authoring-blind"

**Narrowed, not removed:** the headline *"Prebake is authoring-blind by construction"* → *"Prebake is
blind to the per-fe SHAPE channel."* The sentence's own evidence only ever supported the narrow claim
(`design.json`/`blockCustoms` read zero times); the broad phrasing contradicts `ORIENTATION §3`, which
names it *"the overgeneralisation that mis-scoped the curb-freeze question"* — prebake **does** read
`clean/overlay.json`. A03/A06 were scoped off the broad reading.
