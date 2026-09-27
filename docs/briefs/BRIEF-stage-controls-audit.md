<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-26
evict-when: every Stage control has a row (name, what it measurably does, its two ends, verdict), the gaps are listed, Jacob has the report, and the rows he accepts have become work or a check.
-->

# Stage controls audit: does every knob say what it does, do what it says, and span 0 to full blast?

**You are the dispatched agent: a UI/UX researcher. Name yourself: one word, not a name another RUNNING session
holds** (check `ListAgents`, then ask Jacob to `/rename`). **Agent: FRESH.** This is **research**: you measure and
report. You build nothing unless Jacob says so after reading your report.

## The ask (Jacob, 2026-09-26)

*"Go through every item in the STAGE tools and 1: Look at the name, and determine if it accurately describes what
the function is. 2. Test the knob and see what it actually does, and determine if the ends are at 0 and 'Full
Blast.' 3: Look at the set of controls and ask yourself if everything we could want to do/achieve from this toolset
is represented and empowered."*

## Why now (today's evidence that it's needed)

In one day, several Stage controls turned out to do nothing, the wrong thing, or a fraction of what their range
promised:
- the **Light Sources** sliders reached only LS's Stage; Bulb was capped at about 1% of what was wanted; Glow was
  hidden inside the lantern;
- **Brightness** and **Light pools** moved the same thing;
- every **TOD fade** box had never done anything;
- the Street **Eye Height** slider set an absolute height;
- the **Weather** switch landed a partial weather.

The fixes are in `git log` for 2026-09-26. Assume more of the same.

## What to produce, per control

For **every** control on every Stage card (Time of Day, Light & Sky, Hero & Horizon, Light Sources, Surfaces,
Camera, Image, and any other card or toolbar item you find; enumerate them from the code, not from memory):
1. **Name:** does the label say what it moves? Propose a better one if not, in the operator's words.
2. **Effect, measured:** what it actually changes (which uniform, material or store field, traced in the code),
   and what you **see**: a before/after screenshot at a fixed camera and time. Say "no visible change" when there
   is none, and find out why.
3. **Range:** is the low end a true 0 (the effect fully off) and the high end "full blast" (as strong as it can
   usefully get)? Measure both ends. Flag caps, dead zones, a range where most of the travel does nothing, and a
   non-linear feel.
4. **Keyframed controls:** say whether it edits a time-of-day key (and which one) or the whole value. The panel
   doesn't make this clear today.
5. **Verdict:** OK · rename · re-range · broken · redundant (name the twin) · remove.

Then, for the **whole toolset**: what can an operator **not** do today that the look plainly needs? For example:
a control for something visible that has no knob, two cards that should be one, or a missing overall exposure for
night. Rank it.

## How to test without damaging a town

- ⛔ **Stage autosaves every knob into the town's `design.json`.** Test on a **scratch Look forked from Provincetown**
  (Stage's Look menu › New), never on a real town's Look. Tell Jacob its name so he can delete it after.
- Use the dev server that's already running (`:5173`); don't start another. A browser tab that isn't in front stops
  drawing, so ask Jacob to bring yours to the front when you need frames.
- Stage modules load with a version tag in their URL, so a plain `import('/src/…')` from the console gets a
  separate copy. Import the exact URL from `performance.getEntriesByType('resource')`.
- Read `cartograph/OPERATIONS.md` (the Stage cards) first. Where it disagrees with what a knob does, that's a
  finding: say whether it's rot, a regression, or something promised and never built.

## Deliverable

- A report Jacob can read: one table per card plus the gaps list. Publish it as an Artifact page and give him the
  link.
- A proposed check that would catch the "does nothing" class for every card:
  `checks/claims-light-sources-are-live.mjs` is the pattern (each control reaches a live uniform; 0 means off).
  Propose it; don't build it until Jacob says so.

## Bounds

- Read and measure only. No code edits, no bakes, and no autosave into a real town's Look.
- Files other agents hold today: lamp and TOD files (Wick), the shore and water files (Strand), the bake graph
  (Sluice). Reading them is fine.
- Report findings; Boz routes each accepted row to an owner.

**The instruction is confirm-then-report:** enumerate the controls from the code, tell Jacob how many and which cards,
then measure.
