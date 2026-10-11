# BRIEF — a town's link sends its own picture, at the time of day it is sent

<!-- BRIEF-STATE
status: OPEN
dispatched: no
written: 2026-10-11
evict-when: RULING: Jacob texts a staging link for two towns at two different times of day and each preview shows that town, at that time of day, from his Stage camera. The share-card check in §5 is green on every town after being seen red; public/photos/og-preview.jpg and every instance's ogImage are gone.
-->

**You are the dispatched agent. Name yourself:** one word, yours, not one a running session holds or the record
already uses (`ListAgents`, then `git log --format=%s | grep -i <name>`, then `/rename`). **Agent: FRESH.**
**Report to Boz.**

**Instruction: confirm-then-build.** Every premise below is a claim. Check each against the code, say what you found,
and if the code contradicts this brief, stop and flag Boz before building.

---

## 1. What Jacob wants (2026-10-11)

*"We need to move the button for 'SMS Capture' from Preview into Stage; and we need to fix the SMS Preview regime. 1: We
should take the opportunity during 'Capture SMS image' to also save versions for every ToD in the same camera spot,
then the system should send a time-appropriate frame to a device. 2: perhaps not today but soon, we need to fix what
sends to a person's device when someone shares a listing."*

⇒ **This brief is part 1.** Part 2 is §7, recorded so it is not lost and so part 1 leaves room for it.

## 2. What Boz read in source (2026-10-11)

- **The capture.** Preview's *📷 Capture SMS Hero* (`src/preview/PreviewApp.jsx#smsCapture`, `captureOGImage`)
  center-crops the current frame to a square JPEG and posts it to `cartograph/serve.js` `POST /og-image`, which writes
  ONE shared file, `public/photos/og-preview.jpg` (Lafayette Square's). Whatever town is open overwrites it.
- **The card.** The site Workers (`workers/staging-sites/src/index.js#shareCard`, and the same in
  `workers/production-sites`) set `og:image` from `towns.json` (`townsIndex`), which `scripts/publish-player-to-staging.mjs`
  builds from each instance's `branding.ogImage`. Only `src/instances/lafayette-square.js` sets one, so **every other
  town's link sends no picture.**
- **Every path gets the town's card:** `og:url` is always `/<town>/`. A shared place link arrives as the town's front
  page (part 2).
- ⚠️ **Not established:** `PreviewApp.jsx` says the captured file *"is committed with the next Publish (it is in the
  slab pathspecs)"* and `serve.js` lists it among them. The slab now ships to R2, not in a commit. Find out whether
  `og-preview.jpg` reaches any site today, and say so.
- `ROADMAP` "Share and identity" already rules the move: *"The capture moves to Stage and writes into the town's own
  slab, and the shared file and instance slot go."*

## 3. Read first

- `ROADMAP` "Share and identity" (the SHARE line).
- `SLAB-CONTRACT.md` (what a slab file is, and how it is addressed: `src/lib/slabUrl.js`).
- `OPERATIONS` "Production sites" and "Staging" (how a slab reaches `assets.theward.online`, Publish and Promote).
- Stage: `src/cartograph/StagePanel.jsx` and the time-of-day slots (`skyLightChannels.js#KIT_DAY_SLOTS`,
  `TodChannel.jsx`, `todSlotAtMinute`).
- The town's clock: `src/lib/townClock.js` (zone from the town's geography; a town with no zone throws).

## 4. The work

1. **The button moves to Stage.** Capture uses Stage's current camera: one press renders that camera at **every** named
   time-of-day slot and writes one image per slot **into the town's own slab** (a slab file, e.g. `share/<slot>.jpg`;
   name it to fit `SLAB-CONTRACT`), carried by Publish and Promote like any other slab file. Show the operator the
   set it made.
2. **The Worker picks by the town's clock.** On each page request it works out which slot it is NOW in the town's time
   zone and points `og:image` at that slot's file. ⭐ **The slot boundaries must come from the same function the kit
   uses** (sun-relative, so they move with the date and the town's latitude): one home, imported or shared, ⛔ never a
   second copy of the slot logic in the Worker. Say how you get it there.
3. **Each slot has its own address.** Messaging apps cache a preview image by its URL, so one file that changes would
   keep showing whichever slot it was first fetched at.
4. **A town with no capture refuses by name**, at Publish (it says which town has no share image), never by silently
   sending no picture. ⛔ Never another town's picture.
5. **Delete what this replaces, in the same change:** the Preview button and `captureOGImage`'s Preview home,
   `serve.js` `POST /og-image`, `public/photos/og-preview.jpg`, every instance's `branding.ogImage`, and
   `towns.json`'s `ogImage`. Say in the commit what was removed.

## 5. Checks (see each FAIL first; mutation-test)

- **Every town that publishes has a share image for every slot**, read from the slab, not restated. Mutation: delete
  one slot's file → red, naming the town and slot.
- **The Worker's slot equals the kit's slot** for a town at sampled instants across a year (including the slot edges
  around sunrise and sunset). Mutation: a fixed-hour slot table in the Worker → red.
- ⛔ **No kit or Worker file names a town's share image** (no `og-preview.jpg`, no `ogImage` literal).

## 6. Bounds

- **Writes:** Stage (`src/cartograph/`), `src/preview/PreviewApp.jsx` (to remove), `cartograph/serve.js`, the bake or
  publish path only to carry the new slab files, `workers/{staging,production}-sites`, `scripts/publish-player-to-staging.mjs`,
  `src/instances/*.js` (to remove `ogImage`), `checks/`.
- ⛔ **No bake, Publish, Promote or Worker deploy without Boz's clear.** Swale is baking the ground; one bake at a time
  on the machine, load-gated. A Worker deploy changes a live site: Jacob's go, through Boz.
- Commit through explicit pathspecs only (`git commit -- <paths>`), checking each commit's name-status.
- **Registers:** `FEATURES` (a shared link shows the town at the time of day it is sent) · `OPERATIONS` (where Capture
  is, what it makes, and what Publish refuses without it) · `SLAB-CONTRACT` (the new files). Say in each commit which
  it reached.

## 7. Part 2, NOT this brief: a shared place link sends the place's card (Jacob: "not today but soon")

The Worker reads the place from the path (`/place/<id>/<name>`, the Ward's `routes.js`) and serves the place's name and
`og:url`, and its own picture where one exists. ⛔ Not built here. Leave the Worker's card builder so that a
per-path card is an addition, not a rewrite, and say in your report how part 2 would plug in.

## 8. Done when

Jacob presses Capture in Stage for a town and sees its set of images; after Publish, a staging link texted at two
different times of day shows that town at those times; a town with no capture is refused by name at Publish. The checks
are green after being seen red, and the old shared file and `ogImage` slots are gone.
