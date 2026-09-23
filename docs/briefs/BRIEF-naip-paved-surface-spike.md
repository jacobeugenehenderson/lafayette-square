# BRIEF — Can an off-the-shelf model see the ramp-end concrete in NAIP? (one-day spike)

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-23
evict-when: the spike's verdict is on ROADMAP H-3 and Jacob has ruled build / don't build (git rm this file)
-->

**Status:** dispatch-ready. Boz drafted it 2026-09-23, and **Jacob dispatches.** It's a **research spike** with a yes/no answer at the end. ⛔ **It is not a build.**

## Who you are, and the bounds

**You are the dispatched agent. Name yourself: one word, your own.**
**Agent: FRESH.** This is a self-contained measurement. The windows doing the highway work carry a geometry framing that you should not inherit: your job is to find out what the *imagery* says.

- ⛔ **No edits to `src/`, `cartograph/*.js`, canon, or scene data.** ⛔ **No pours. No new dev servers.**
- **Allowed:**
  - Read anything.
  - Fetch public imagery and public model weights over the network.
  - Write code under `scratch/naip-spike/`. Put imagery and weights under **`scratch/.naip-spike/`**, and add that one path to `.gitignore`, following the file's existing convention: the checker is tracked, its scratchpad is not. ⛔ **Never commit imagery or weights.**
  - A Python environment **inside the project** (`scratch/.naip-spike/.venv`). Nothing outside `lafayette-square.nosync/`.
- **Timebox: one day.** If it isn't answerable in a day, the answer is "not cheaply," and that is a result.

## The question, exactly

At LS's ramp ends there is a surface that is **neither street, highway, verge nor block**: the concrete that signal poles, islands and channelised turns sit on (`ROADMAP H-3`, *"a third surface"*; `OSM-FORENSICS §1.6`, *"paved positive space that is neither street nor block"*). OSM barely maps it: `area:highway=traffic_island` counts are **LS 1 · HPDM 8 · Huron 0**. So the kit will **derive** it from geometry, and that derivation is question 8 of the highway plan, being answered separately.

**This spike answers one thing: does an off-the-shelf paved-surface model, run on NAIP imagery, see that concrete well enough to CONFIRM or REFUSE the geometry-derived islands?** Put more sharply:
1. **Agreement:** for each junction island the geometry derives, what fraction of its area does the model call paved?
2. **Misses:** where does the model see paved surface inside the terminal zone that is **not** street, highway or block, i.e. a concrete zone the geometry missed?
3. **Blind spots:** what fraction of the terminal zone is unreadable, because of tree canopy, shadow, or vehicles?

## Why this framing (read this before designing anything)

- **The ML output can only ever be EVIDENCE, never the answer** (`CLAUDE.md` Layer 0, q2: no fallbacks). A model's polygon standing in for the map is exactly the plausible-looking success the kit must never produce. So the useful role is a **check**: confirm or refuse what geometry derived, and print any disagreement loudly.
- **We have decided before not to import surface polygons.** The median research of 2026-06-15 (`scratch/MEDIAN-RESEARCH-FINDINGS-2026-06-15.md`) found mapped surface polygons to be *"a coverage trap"*, and noted that A/B Street gave up on these shapes. Imagery is a different, universal source, and that is the reason to test it. ⛔ **It has never been evaluated here:** a search of the docs and the archive finds nothing.

## The two sites (Jacob's choice)

1. **South Jefferson Avenue × I-44.**
2. **The complex at Truman Parkway × I-55 / I-44.**

**Locate them from the data. Do not hand-type coordinates.**
- The at-grade ramp ends are the grade-separated chain endpoints that share a vertex with a non-highway street. Take them from `cartograph/data/lafayette-square/clean/skeleton.json`, near the chains named `South Jefferson Avenue` and `Truman Parkway`.
- To convert the frame to lat/lon, use **`cartograph/data/lafayette-square/geography.json`'s own origin and metre factors**, the way `cartograph/bake-landscape.js` reads `geo.lonToMeters`.
- ⛔ **Verify the axis orientation against one known feature before trusting any overlay.** The kit's rule is *"one compass frame, no trick rotations"*, and a mirrored overlay looks entirely plausible.

## The inputs

- **Imagery: NAIP** (USDA National Agriculture Imagery Program). About 0.6 m in recent years, 4-band RGB plus near-infrared, public domain, covering every US town. That is what makes it kit-shaped.
  - Access routes I recall but have **not verified**: Microsoft Planetary Computer's STAC `naip` collection, or USGS EarthExplorer.
  - Record the **acquisition date**. A pre-reconstruction image of a ramp end is a wrong answer that looks right.
- ⛔ **Not Esri World Imagery**, the aerial the kit displays: its terms may not permit extracting data from it, and nobody here has checked.
- **The model: off-the-shelf only.** No training, and no fine-tuning beyond what a model's own docs call standard. These candidates are recalled, not verified; confirm they exist and **check their licences** before using any of them:
  - a land-cover model already trained on NAIP with an impervious or road class (e.g. **torchgeo**'s NAIP / Chesapeake land-cover weights);
  - a zero-shot, text-prompted segmenter (SAM plus a grounding model) as the second opinion.
  - Pick **one primary**, say why, and say what the other would have added.
- **Comparison targets.** Use these rather than rebuilding them:
  - **The geometry-derived islands:** run `node scratch/h3-terminal-islands.mjs lafayette-square`, the highway review's probe. It reads `public/baked/lafayette-square/shape.json` and prints each terminal-adjacent region's area, thickness, highway share, and a count of the buildings inside it. **The regions with 0 buildings are the island and infield candidates.** Record the timestamps of both files it reads: another agent's re-pours may be rewriting them today.
  - **OSM's single `area:highway=traffic_island` in LS**, as a sanity point.
  - **Jacob's eye:** the overlays below.

## The deliverable

Deliver it in chat to Jacob, backed by files under `scratch/naip-spike/`:
- **For each site, one overlay PNG:**
  - the NAIP image;
  - the model's paved mask, semi-transparent;
  - the geometry-derived island outlines;
  - the street, highway and block edges from `shape.json`.
  Label everything. ⭐ **This is what Jacob judges.** A number without the picture will not be accepted, and neither will a picture without the numbers.
- **The three numbers from "The question, exactly"**, per site and per island.
- **A verdict: BUILD / DON'T BUILD / NOT YET**, with the one tradeoff. BUILD would mean: a NAIP paved-surface check becomes an optional intake source, and a pour prints any disagreement with the derived islands. Also say what it would cost per town: download size, run time, and GPU or CPU.
- **Instrument disclosure:** the model name and version, the NAIP tile ids and dates, and anything that could make the numbers flatter than the truth.

## Coordination: other sessions share this checkout

- **"Highway Builder" [07b5ef]** is doing the highway plan review. Your comparison probe is its file; read it, don't edit it.
- **"No Namer" [ebe078]** is building `A19` and re-pouring towns, including LS later. That rewrites `shape.json`.
- **"Revetment" [a572ba]** is doing the shore stone, in `src/`.
- Before you commit anything, message whoever else is working, by ref, via `ListAgents` → `SendMessage`. Commit **only your own paths, by name**: `git commit -- <paths>`. ⛔ No stash, reset, rebase or branch switch here. The `.gitignore` line is a shared file, so announce it.

## The instruction

Confirm, then measure.
1. Read `ROADMAP H-3` (the third-surface line), `OSM-FORENSICS §1.6`, and the median research note.
2. Locate both sites from the data, and tell Jacob the coordinates and NAIP tiles you found **before running any model**.
3. ⛔ **If NAIP does not cover LS at a usable resolution or date, or if no model is usable off the shelf, stop and report it. That is the answer.**
4. Then run the model, build the overlays, and give the verdict. **Stop there. No integration into the kit.**
