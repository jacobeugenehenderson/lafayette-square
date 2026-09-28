<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-09-27
evict-when: RULING: Jacob calibrates the floor on sample frames, and the per-town check exists and passes
-->
# BRIEF — A legibility floor for the plan-view map

**For:** a fresh agent, in the kit. **Written:** 2026-09-27.
**Spec it serves:** The Ward's `README.md` §11 — in Society the map is the lower half of a phone
screen, and whether it reads decides whether half and half works. Legibility is measured **before**
any look is tuned.

## The rule
Society's map must read at a glance — buildings against ground, the lit category against the
rest, the street names — at **every hour** and in **every town**. Realism is free to do anything
above that floor. ⛔ Tuning one town's night colours until they look right is the "constant that
was right for town #1" trap; the floor is a measurement every town must pass.

## Premises — confirm, and say what you found
1. **At night the plan view is very dark.** Seen on 2026-09-27 in the running player: buildings
   near-black on near-black ground, canopy smudging across streets, small street labels, rain
   streaks over everything. One observation, one town, one hour — confirm before generalising.
2. **Reuse before you build.** Preview has a phone-aspect frame and the kit has many render
   harnesses in `scratch/`. Find an existing way to render a town's plan view at a set hour and
   size before writing one.

## The work
1. **A harness** that renders each poured town's plan view, at phone half-height, at noon, dusk
   and midnight.
2. **Measures** on those frames: roof-to-ground contrast, lit-building-to-unlit contrast, street
   label contrast.
3. **The threshold is calibrated by Jacob's eye, not chosen on paper.** Proxy renders mislead on
   this map; the operator's eye is the gate. Show him a set of frames, record which read and which
   don't, and set the floor from that — then the check holds every town to it.
4. Only then: whatever look changes the failing towns need, as authored values, never constants.

## Checks
The harness plus thresholds is the check, run per town at three hours. It must be seen to fail on
a frame Jacob judged illegible.

## Docs
Record the measured floor and the command that reproduces it; never the numbers alone.
