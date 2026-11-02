# BRIEF — the time bar is an offset from now (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below). **Repo:** `~/Desktop/dev.nosync/theward` only.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.**

⛔ **DISPATCH ONLY WHEN** the kit's `<Town timeOffsetMs>` prop (below) has merged into integration and Boz names the
commit. This brief moves ward-kit to it. The gate also needs, at that commit: Town refuses `time` + `timeOffsetMs`
and `holdScrubbedTime` + `timeOffsetMs` by name (hold with a non-zero offset would stop the ticker, the freeze again),
and a kit check that the offset advances per frame and holds across a remount.

## The ruling

Jacob, 2026-11-01, via Boz: *"I don't like the static clock; I think the slider needs to be indexed to the time, not
reflect it itself; we never really leave now's time we just scrub along its index. Also I think maybe we... treat the
text differently so it reads as set apart? Ghosted? Italicized?"* What he saw on staging: a scrub to 7:59 froze there,
and the 8:00 show never came.

## The premise (read and measured by Ward, 2026-11-01, at theward `568c645`, ward-kit `151a63f4`; confirm it)

- `src/almanac/almanacClock.js` stores `scrubbed` as an absolute Date (null = live), and nothing advances it.
  `Scene.jsx` passes it as `<Town time={scrubbed}>`. Town's contract: a Date "draws the town at that instant … and
  nothing ticks it", and Town.jsx unmounts `<TimeTicker>` (SkyTickers.jsx) when `time` is a Date. So the freeze is the
  Ward's, as built.
- Live is NOT frozen (measured: the kit store's `currentTime` tracked the wall clock within 1 s over 130 s).
  TimeTicker advances it every frame, and LightShow (`LightShow.jsx`, frame loop) reads `currentTime` for a show's
  playback position. ⛔ So the Ward must never drive the scene with its own Date on a timer: a scrubbed show would
  play at the timer's rate.
- Readers of `scrubbed`: Almanac (Head, Plate, the Now/Live cell, the aria-live line), AlmanacSheet (the pointer
  scrub, Moon), DayStrip (pointer, arrows, Home and End), Scene, `useShownTownNow`, `wardTime.js` (embed relay).

## The work

1. **The store holds `offsetMs`** (0 = live), not an instant. One derived reading, now + offset, for every reader
   above. ⛔ `scrubbed` is DELETED, not kept beside it (say so in the commit).
2. **Scrubbing** sets offset = picked − now; Back to now sets 0. A drag released on now's own minute is live (offset
   0), a stated rule, not a tolerance constant. The thumb moves with the shown time; when now + offset crosses the
   strip's window end, the offset holds and the day rolls. Keyboard clamps stay on the picked instant.
3. **Scene passes `<Town timeOffsetMs={offsetMs}>`** and no `time`. The kit's TimeTicker stays the one writer of the
   town's clock. ⛔ No Ward timer writes or re-renders the scene's time.
4. **Set apart:** the shown time is in ITALIC (Head, Plate, the sheet) while offset ≠ 0. Ghosting lowers contrast
   (README §6), so italic, not ghosted. "○ Now" stays. Jacob sees it on :5180 before merge.
5. **`wardTime`:** an embedder's minute becomes an offset on receipt. The Ward relays only a person's scrub, never
   the tick, so the protocol is unchanged.
6. **A reload is live** (existing rule).
   - **What a visitor sees while scrubbed, written into README §2 so nobody files it as a bug:** under a non-zero
     offset the kit's store is `isLive: false`, so the sky is the FORECAST at the shown time, not current
     conditions (the existing scrub rule, carried over).
7. **The check** (`checks/`, wired into `run.mjs`): a CDP-injected clock (Date and performance, no hook in src).
   Scrub to 1 minute before a planted boundary, advance 61 s, then assert that the shown text, `useShownTownNow` and
   the kit store's `currentTime` (read through the page's module URL) all moved EXACTLY 61 s (this also catches a `timeSpeed` ≠ 1, which would drift the town away from the text) and italic is on. Back to now
   leaves italic off and the offset at 0, and the store tracks the clock. **Mutants**, via `checks/mutateSrc.mjs`:
   the offset frozen as an instant; Scene passing `time`; italic missing; the tick relayed to the embedder. Each must
   turn it RED. Report each line.

## Bounds

- A branch `ward/the-time-bar-is-an-offset` off the Ward pin branch Boz names; `git commit -- <paths>`. ⛔ No kit
  edits. ⛔ No publish.
- The commit names its register (README §2 "Returning to the present"; FEATURES if a partner would say it) or says
  "Reaches no register."
- The heavy slot is Boz's: ask before the full `npm run check`, and before any `--mutants` on :5180 (only when Jacob
  isn't on it).

**Confirm, then build:** read the kit's `timeOffsetMs` at the named commit and the Ward's code, then tell Ward what you
found. If they contradict this brief, stop and flag.

## Zob's co-sign

Zob, 2026-11-01: co-signed; read at integration 151a63f4; conditions 1 (both refusals in the gate), 2 (the forecast
sky while scrubbed, in README §2) and 3 (the exact 61 s assertion).
