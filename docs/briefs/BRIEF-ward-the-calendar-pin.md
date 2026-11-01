# BRIEF — the calendar pin (the Ward)

**Owner:** Ward. **Reviewer:** Zob (co-sign below). **Repo:** `~/Desktop/dev.nosync/theward`, plus moving the pin
worktree `~/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit`.

1. **You are the dispatched agent. Name yourself:** one word, yours, and not one a running session holds (check with
   `ListAgents`, then `/rename`).
2. **Agent: FRESH.**

⛔ **DISPATCH ONLY WHEN** Tinsel's calendar route (`tinsel/displays`) has merged into `integration/2026-10-20`. Boz says
when, and names the integration commit. Until then this brief waits.

## What this pin carries

The kit's `<Town>` from that commit REQUIRES a `calendar` prop. The kit BACKLOG lists three preconditions (integration
`14781295`):
1. **The kit's per-layer refusal** (Fuse, integration `249d7658`): merged; it comes with the pin.
2. **The Ward's scene boundary:** `ward/scene-says-why` = `96097ea` (Herald; Zob static PASS; full check run, standing
   reds only). Merge it.
3. **Scene.jsx passes the calendar:** this brief's build (below).

It also carries **the event card**: `ward/event-at-its-venue` = `30a6b53` (Usher; Zob static PASS; build plus full check
run, standing reds only). Merge it. ⛔ It refuses every `links_to` row, so it ships only with Huron's sorted data
(`tinsel/displays` `08eff53d`, which deletes the key). Boz owns the release order; confirm with Boz before any publish.

## ③ — the build (read in source by Ward, 2026-10-31, at theward `96097ea`)

- The contract is the kit's `src/hooks/useTownCalendar.js#readTownCalendar`, read at the pinned commit:
  `null` (not answered yet) · `[rows]` · `{ absent: true }` (the manifest's `content['events.json'] === null`) ·
  `{ error }` (no content index for it, or the listed file doesn't answer). ⛔ A failed read is never taken for absence.
- The Ward already reads the same file itself. `src/content/content.js#published('events.json')` goes through
  `src/town/manifest.js#contentUrl`, which returns null when the manifest says null and throws when the manifest doesn't
  list the file. **The conflation is one line:** `calendar = cal.value?.events || []`, plus the catch leaving `[]`. Both
  "absent" and "failed" reach a reader as an empty list.
- **The fix:** `content.js` holds the town's PUBLISHED calendar under the kit's contract, as its own state
  (`null` → rows | `{absent:true}` | `{error}`). The announcements merge (`mergeEvents`) keeps reading rows only.
  `Scene.jsx` passes that state as `<Town calendar>`, **and `displaySource="published"`**: integration's `<Town>` has
  required it since `dea49735` (Town → SetPiece → Displays → `drawerSource`). Without it a display refuses with "the app
  names no drawer source to <Town>", and PTown's Light Show never draws in the Ward.
- **The rows shape:** accept `Array.isArray(j) ? j : j?.events`, exactly as `readTownCalendar` does, and anything else is
  `{ error }`. LS's events.json is a BARE ARRAY (`5725b7c7`), so today's `cal.value?.events` would read it as no rows.
- **A missing content index:** `src/town/manifest.js#contentUrl` does `name in manifest.content`, a bare TypeError when
  `manifest.content` is absent. Make it refuse by name ("the manifest carries no content index for <name> (re-run
  bake-manifest)").
- **`eventsKnown` is replaced by two source states** (Ward's ruling, 2026-11-01, on Kalends' stop; Zob's change 1). Today
  it means "ANY source answered": init and `refreshAnnouncements` set it true whatever the published read did. Each
  source now holds its own state, and ⛔ an `{error}` is never pending:
  - calendar: `null` (pending) → rows | `{absent}` | `{error}`, readTownCalendar's own shapes, not flattened to a boolean.
  - posts: pending → known | `{error}` (init's catch sets the error; a later `refreshAnnouncements` success may set known).
    Refresh reads posts only and never touches the calendar state.
  - Ticker: pending says "Loading"; an `{error}` shows its own words; "Nothing is happening" only when both are known
    with nothing live.
  - Place's `gone`, per ref prefix (`town:` → calendar, `post:` → posts): pending waits; `{error}` says that source
    couldn't be read, in its own words (as `Gone` does); known and not found is gone.
  - Society's "nothing lights" line fires only when both are known; an `{error}` is the report instead.
  ⛔ Don't mount the kit's `useTownCalendar`: that's a second reader of the same file. ⛔ Only the published rows go in,
  never the merged set with Guardians' posts (the agreement with Tinsel).
- **The check:** a check that reads the kit's contract from source (the four shapes, by name, from
  `useTownCalendar.js`), never a copy, and asserts the Ward hands `<Town>` each one, plus `displaySource="published"`.
  Use fixtures for absent, no content index, missing from the index, a 404, a bare array and `{events}`. **Mutation-test:** each must turn it RED: restore the `|| []` (absent and failed cases); init sets posts known whatever
  happened; a calendar `{error}` read as known (Ticker says "Nothing is happening"); init's catch leaving posts pending
  (a `post:` ref waits instead of naming the failure); refresh writing the calendar state.

## The pin (OPERATIONS §"Pin", and WARD §6)

- A branch `ward-pin/<date>` off `ward-pin/2026-10-30`. ⛔ **Dry-run the merge of the two branches in a throwaway
  worktree first, never the live checkout** (the standing rule since 2026-10-31's conflict markers on Jacob's screen),
  then merge for real. Then build ③.
- Move `ward-kit` to the named integration commit (`git -C …/ward-kit checkout <commit>`, as the past pins did; read
  the Ward's git log for the pattern).
- Record the pin in the Ward's `OPERATIONS.md` in the same commit. ⭐ Also correct "Where things stand" from a MEASURED
  read (`curl -sI` without following redirects, plus the served page's `/_ward/<sha>/` script path, cache-busted). As of
  2026-10-31 (Ward) every host serves the Ward at `4334c64`, and lafayette-square.com 301s to lafayettesquare.online. The
  host records in R2 are not read; say so.
- Run the Ward's `vite build` and full `npm run check` in the main checkout. ⛔ No Ward worktree can build (relative kit
  paths): surfaced, not fixed. Report every red as standing or new. The standing ones as of 2026-10-31: download-weight;
  endpoints (gas:verify-resident); the a11y audit and contrast (not built); society-flight-has-no-long-frame (red on
  base); society-frames-what-it-lights (flips on base).
- ⛔ **PREPARED, NOT PUBLISHED.** The kit bundle (`scripts/publish-kit-bundle.mjs` from `ward-kit`) and `publish:staging`
  are Jacob's word after Boz's green and Ward's (WARD §6).

## Bounds

- Write in `theward` only, plus `ward-kit`'s checkout move. ⛔ No kit edits.
- `git commit -- <paths>`. The pin commit names its register (OPERATIONS: the pin) and the event card's FEATURES line
  (already in Usher's commit).
- The heavy slot is Boz's to grant: ask before the full check run.
- **Out of bounds, surface it:** the pin carries Fuse's failure sink (kit `src/lib/failures.js`, `useFailures` exported for
  the Ward). Until the Ward shows it, a refused kit layer is the console plus the sink. Showing it is the next Ward brief.

**Confirm, then build:** read the kit at the named commit and the Ward's code, tell Ward what you found, and if they
contradict this brief, stop and flag.

## Zob's co-sign

Zob, 2026-10-31: co-signed. Changes: <Town displaySource="published"> beside calendar (integration requires it since
dea49735); rows accepted as a bare array or {events}, as readTownCalendar does, with contentUrl naming a missing content
index; the merge dry-run in a throwaway worktree.

Zob, 2026-11-01: co-signed with changes 1 (three-valued source state; an {error} is never pending) and 2 (three more
mutants).
