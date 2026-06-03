# Cold verification — independent data-dependency audit

**For a fresh agent with NO prior context on this codebase or what changed.** This is a ground-truth check; I have no stake in which way the answer comes out, and I need you to have none either.

## Rules of evidence (important)

- **Read ONLY the source code.** Do **not** read commit messages, `HANDOFF-*`/brief/design docs, or any file that describes what someone *intended* to build. Those state intent; I need what the code *does*.
- **Do not trust comments or function names as facts.** A comment that says a function "doesn't read X" is a claim, not evidence — verify it against the actual data flow. Names can lie too.
- If you cannot fully resolve where an input comes from, **say so explicitly** — do not guess or wave it through.
- **Do not assume a "clean" answer is expected.** A single overlooked dependency is exactly the failure I'm trying to catch. Trace exhaustively; flag anything ambiguous.

## Orient yourself

In `src/lib/tileGround.js`, find the function(s) that build the **interior pedestrian-zone geometry** — the treelawn/sidewalk strips and the land-use fill that sit *inboard* of the road surface (they're concentric inward offsets of the asphalt-inner / curb-line ring). It may be named `sectionPass` or similar — **confirm which function it is by what it computes, not by its name.** Tell me which function you identified and why.

## The one question

**Does that interior-ped construction reach the raw street centerline geometry during its own execution?**

By "raw street centerline geometry" I mean: the ordered point arrays of the streets — e.g. `streets[].points`, `streetsOrig`, `centerlineData`, `ribbons.streets[].points` — or anything *recomputed from them at run time* (computing segment ordinals / `segOrd` by probing raw chain points, `splitAtJunctions` over chain points, nearest-vertex probes of raw street polylines).

"Reaches" counts **through any path**: a direct argument, **a field of a passed-in object** (e.g. it's handed the whole `ribbons` and reads `.streets[].points`), a closure/module-scope variable, or an imported module it calls into. Trace **transitively** — into every function it calls, every closure it captures, every import it reaches.

**Crucial distinction (read twice):** I am asking whether *this function* reaches the raw chain **during its own execution**. It does **NOT** count as a chain access if the function merely consumes a value that some *earlier, separate* function already computed from the chain and handed in as finished data — a pre-built ring, an array of numbers like a precomputed `segOrd`. The provenance of its inputs is not the question; the question is whether *this function itself* (and its own callees/closures/imports) touches the raw chain.

## Answer format

1. **Which function** you audited, and how you confirmed it's the interior-ped builder.
2. **Binary verdict:** does it reach raw street-centerline geometry during its own execution — **YES or NO.**
3. **Evidence:**
   - If **NO**: list every input it consumes, and for each show it resolves to either a precomputed structure passed in (a built ring, a metadata array of already-computed values) or a scalar parameter. Confirm none of its transitive callees/closures/imports reach the chain.
   - If **YES**: name exactly what chain data it reads, the `file:line`, and the path (direct argument / field-of-passed-object / closure / import).
4. Anything you **couldn't resolve**, stated plainly.

Trace the code. Tell me what's actually there.
