# BRIEF — Extract the permitted manuals into the research database, by topic

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-23
evict-when: every permitted source in references/registry.json has been extracted for the topics below (git rm this file)
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-23, and **Jacob dispatches.** ⛔ **This is research. There is no code.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** This is a reading job, and it needs no context from the day's geometry work.

- **Allowed:** read the **permitted** sources, and write findings into `references/registry.json`.
- ⛔ **Not allowed:** `src/`, `cartograph/*.js`, canon edits, pours, and reading any source whose `terms.aiUse` is not `permitted`.
- ⛔ **Never commit a copy of a source.** Local copies go in `references/files/`, which is gitignored.

## Why, in Jacob's words

> *"Looking for an instance and then going looking for textual support for it strikes me as backwards; we should collate what we know and then when we encounter questions it's an easy step to go see if we have an answer."*

So you **read each permitted manual once, by topic,** and record what it says **before** anyone asks. A question that arrives later is then a lookup. The database's rules are in `references/README.md`: read all of it, including **the comb**, **extraction first**, and **rule 5**.

## What to extract (the kit's topics, in priority order)

1. **Highway cross-section:** lane widths, outside and inside shoulders (and any condition by lane count), ramp lanes and shoulders, medians.
2. **Gores, ramp terminals, channelization:** neutral areas, islands, **minimum island size, painted vs raised**, nose treatment.
3. **Cul-de-sacs and turnarounds:** turning-circle radii, central islands, cap geometry.
4. **Roundabouts:** central island, splitter islands, apron. (NCHRP is **not** permitted; a state manual's own text may be.)
5. **The pedestrian realm:** sidewalk (pedestrian access route) width, planting strip / treelawn, curb width and height, curb ramps, refuges.
6. **Street cross-section by class:** lane widths for local, collector and arterial; parking lanes; corner radii.

## Sources, with today's permitted set

Run `node checks/claims-references-are-sound.mjs` and read its `permitted sources` line. As written: `mutcd-11r1` · `fhwa-sa-13-027` (local copy in `references/files/`) · `fhwa-interstate-design` · `prowag-2023` · `naip` (imagery, not text) · **`caltrans-hdm`** · **`massdot-design-guide`**.
- ⭐ **The two state manuals are the richest and are unread.** Caltrans for Altadena (CA); MassDOT for the four Outer Cape towns (MA).
- `mutcd-11r1` Part 3 was **partly read by Grader**: see the `f-mutcd-*` findings. **Don't duplicate them.**
- **Access:** `.gov` sites often return 403 to a non-browser client. If a source won't fetch, **stop and ask Jacob to download it** into `references/files/`, as he did for FHWA-SA-13-027, and record the sha256 on the source.

## How to record each statement

Each normative statement becomes a **finding**:
```json
{ "id": "f-<source>-<short>", "topic": "<one of the six topics>", "question": null,
  "kind": "value" | "rule" | "range" | "defers",
  "value": { … units explicit … }, "source": "<source id>",
  "where": "<chapter / section / page>", "quote": "<verbatim sentence>",
  "scope": "<road class / condition it applies to>", "foundOn": "YYYY-MM-DD", "foundBy": "<your name>" }
```
- **Record the condition** ("for design speeds ≥ 50 mph", "on local streets"). A value without its condition is a trap.
- **Rule 5:** a statement whose **authority** is AASHTO (*"AASHTO recommends…"*, *"per AASHTO"*) is **not** a finding. List it on the source as `aashtoPassages` (section plus a one-line gist, **no quote**). A statement the manual makes **in its own voice**, even if it cites AASHTO in support, **is** eligible.
- **Negative results count.** If a manual defers a topic elsewhere, record a `kind: "defers"` finding.
- **Link to open questions:** if a finding answers one of `references/`'s **open questions** (the check's dispatch queue: island size, ramp section, inside shoulder, curb, treelawn, sidewalk defaults, cul-de-sac representation), set its `question` as well as its `topic`, and update that question's `status`/`findings`. ⛔ **Don't flip a question to `answered` on a finding from a different state than the towns it serves without saying so.** A Caltrans value answers for CA. For OH or MO it can only be a **derived** value, and the database's own `derived` rule governs that.

## Coordination and commits

- Other sessions write in this checkout, including in `references/registry.json`: Boz, and Highway Builder hands findings to Boz.
- **Before each commit:** run `git diff references/registry.json`. If anyone else has uncommitted hunks there, **stop and message Boz** (`ListAgents` → `SendMessage`) rather than sweep them in.
- Commit **only `references/registry.json`** (plus a `references/files/` sha note), by pathspec. Commit **per source**, so each commit is reviewable. The check must pass before every commit.
- ⛔ No stash, reset, rebase or branch switch.

## Deliverable

For each source, in chat to Jacob:
- findings extracted per topic;
- open questions it answered, and for which state;
- AASHTO-authority passages excluded;
- what it doesn't cover.

**Stop when the permitted set is done**, or earlier if a source can't be fetched.
