# BRIEF-hero-arrival-perf — §3 Sequence, retired 2026-10-07 (Strobe)

Retired for CURRENCY: steps 0–2 were done; their measurements ride the commits. Live home: `docs/briefs/BRIEF-hero-arrival-perf.md` (its STATE).

### Step 0 — the frame-timeline recorder (instrument only; no fixes)
- **Measure the time between presented frames** (`requestAnimationFrame` deltas), every frame. That is what the eye
  judges as choppy, and it needs no GPU clock.
- **Put marks on the same timeline:**
  - a slab file or tree file arrives;
  - a mesh first draws (`DrawnAnchor`);
  - a material or shader compiles for the first time (`renderer.info.programs` growing);
  - a texture goes up to the GPU, or a KTX2 transcode finishes;
  - a slider input or camera keyframe;
  - a long animation frame and its scripts.
- **Three scripted, repeatable runs:**
  - **(a)** a cold page into Hero, through the movie;
  - **(b)** a scrub of the time slider across the day at a fixed rate;
  - **(c)** a fixed camera move in Hero.

  Each run is the same path every time, so two runs can be compared.
- **Output:** per run, the frame-interval series (p50 / p95 / max, and every frame over the target's budget), with
  each hitch listed beside the marks that coincide with it. ▶ Expose the result as `window.__frameTimeline()`, and
  add one `checks/` script that runs a scripted run headless and prints it.
- **Attribution by removal:** the same run with one class off (trees · hero cards · lamps · post stack · ground
  detail · shadows), compared frame series against frame series. Repeat the baseline to show the noise.
  ⛔ Trust the all-on total; per-class deltas don't sum (`PREVIEW.md §4`).
- ⛔ **Mutation-test the instrument.** Inject a known 50 ms stall at a known frame, and show it is caught, timed and
  attributed to its mark.
- ⛔ **Headless is not the operator's eye** (`feedback_proxy_render_is_not_the_operator_eye`). Validate the recorder
  once in Jacob's own browser on Huron, and say which surface every number came from.

### Step 1 — measure and rank. ⛔ STOP and report to Boz before changing anything.
- For Huron:
  - what lands when on arrival, and what the eye sees at each moment ("the trees come in in drabs");
  - every hitch with its cause;
  - the steady frame cost in Hero, with each class's share by removal;
  - what one slider step costs, and why.
- Re-check H-9's three leads by measurement.
- **Rank the causes by what they cost the eye.** For each, name its remedy as **engineering** (ours), **deployment**
  (a per-surface switch) or **creative** (Stage).
- Write only the numbers; where a mechanism is not measured, write **"cause not established"** (`CLAUDE.md`).

### Step 2 — fix one cause at a time, each measured before and after
- Each fix is its own commit, with Huron's before/after frame series in the message, then Lafayette Square's.
- **Jacob's idea, tested as one fix:** order the arrival so the trees land before the ground's detail (base ground →
  buildings → trees → ground detail), or whatever order step 1's numbers favour.
  - It needs the deferral machinery the ROADMAP says doesn't exist. Build it as the general mechanism (an asset class
    can arrive after WARD USABLE), not a Huron special case. That machinery is what Preview v2's startup timeline will
    later drive.
  - ⛔ WARD USABLE stays ground + buildings, as Jacob ruled. A deferral that delays it is a regression.
- ⛔ **"It's only seen from far" is not an argument.** A fix that degrades the close camera is not a fix.
- ⛔ **No fallbacks:** a deferred class that never arrives must fail loudly, not leave a quiet hole.
- ⛔ The fix that replaces something removes it in the same commit (`CLAUDE.md`, a fix in three parts).

