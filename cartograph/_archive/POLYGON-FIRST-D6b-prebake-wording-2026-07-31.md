# ARCHIVED — the D6b "freeze iA in prebake" wording (superseded 2026-07-31)

**Kind: Diary.** Moved out of `cartograph/POLYGON-FIRST.md §3` when D6b landed as the
producer split (`4dd05303`). Kept because *why* this wording was wrong is the
instructive part, not the wording itself.

## The text, as it stood

> **D6b — freeze it in prebake (the D2 pattern, extended to geometry).** Factor D6a so
> `derive.js` emits `iA` **once** and freezes it into `ribbons.tiles[]` beside
> `{ring, edges}`, with its load-bearing companions (`ring, vertR, bandJoin, cap,
> runs[].measure, med, tips` — `PREBAKE.md §4.1`), in the **authored** state. Moves the
> wall to ~P3. **Makes Check B writable.**

Related sequencing line, same section:

> D6b+D6c are the architecture move, gated on D6a proving out on Jacob's eye. D3 (corner
> identity) folds into D6b — once the curb is a frozen offset cornered at
> offset-intersections, the divided-transition corner identity is frozen *as part of the
> curb*, dissolving the whole transition defect class.

## Why it could not be built

**Prebake is authoring-blind by construction.** `derive.js` / `pipeline.js` /
`promote-ribbons.js` read `design.json` / `blockCustoms` **zero times** — every mention in
`derive.js` is a comment, and `derive.js:3813` says so outright: *"widths resolve at shape
time (`runMeasure`/`blockCustoms`)."* Structurally, `ribbons.json` is per-**scene** while
`blockCustoms` is per-**look**.

So "freeze `iA` in prebake **in the authored state**" asks for two incompatible things at
once. Built literally, it would have frozen a curb from **bare defaults** — the exact
failure `CLAUDE.md` **Layer 0 q3** was written to forbid, one day after it was written,
and baked into an artifact where nothing downstream could see it.

## The correction that replaced it

⭐ **The goal was always CHAIN-freedom, not prebake-location.** Check C asks for *"no chain
in the producer's scope"*; prebake-freezing was the assumed *mechanism*, never the
requirement. **The thing that has to die is the chain, not the authoring.**

Landed instead: `freezeCurbEdgeFacts()` (chain-derived, one fact per ring edge, `baseHW`
frozen pre-authoring so the facts stay look-agnostic) → `buildCurbRings()` (chain-free;
the authored override applies inside the builder). Byte-identical on both the authored and
bare-defaults state. As-built record: `POLYGON-FIRST.md §3`.

## The lesson worth keeping

A doc that specifies something impossible costs a session — and this one was *specific*
enough to sound checked. The agent who caught it did so by verifying the premise in the
code (three greps) rather than implementing the instruction. `CLAUDE.md` "Verify your own
premises"; `feedback_stated_requirement_is_the_spec` cuts the other way only when the
requirement is *possible*.
