# BRIEF — the Intake Manifest: the last unbuilt step in the kit

**You are building the stage that makes a pour reproducible by someone who is not Jacob.** Everything downstream of it — skeleton, survey, section, bake, slab — is built and works. Everything upstream of it is currently a collection of scripts, one-off fetches, and things that live in an agent's head for the length of one session. This is the seam.

> ⛔ **Before you write code, run the routing gate in `CLAUDE.md`** — `ORIENTATION.md` → `README.md §⭐ START HERE` → the topic canon. At minimum read `cartograph/INTAKE.md` (the provenance SSOT), `NEIGHBORHOOD-INPUTS.md §0.1 and §5.1.1` (the three tiers + the ratified content schema), and `SLAB-CONTRACT.md §0/§C2` (what the slab is and what the player reads). **Do not rebuild the model from grep.** Cite what you read.

---

## 1. The problem, in Jacob's words

> *"There are a gajillion things that the agent has been collecting and associating and researching and collating; so far, each time we've had to do it one re-connection at a time."*

Every neighborhood poured so far has been assembled by an agent rediscovering, per session, which inputs exist, where they come from, what shape they're in, and which ones the pour actually needs. That knowledge has never been written down in a form the *machine* consumes. When it's written down at all, it's prose in `INTAKE.md` or a comment in a fetch script.

The consequence: a pour can complete "successfully" while missing trees, lamps, elevation or parcels, and nothing anywhere says so. Księży Młyn baked 1,640 buildings and four of its authored listings pointed at buildings that weren't in the slab — logged by an orphan check nobody read.

## 2. What to build

**A per-scene manifest that declares every input a pour needs, tracks whether it's present, records where it came from, and is fillable by hand.**

Three parts:

### 2.1 The manifest file
`cartograph/data/<scene>/intake.json` — declares each input: what it is, whether it's required, the path it must land at, and its provenance once acquired (source URL or description, date, and any format conventions that matter — projection, no-data sentinel, units).

Model it on the existing artifacts, don't invent a schema in the abstract: read what `fetch.js`, `fetch-msbf.js`, `bake-terrain.js`, `bake-lamps.js` and the arborist bake actually *read*, and let the manifest describe exactly those.

### 2.2 The panel
An **Intake** section in the Extent tool listing every declared input with its status. Each row gets:
- a **Get** button that opens a file picker and puts the chosen file at the required path (they are always files — see §4);
- a **(?)** that explains what this input is, where to obtain it, and how to tell a good file from a bad one.

Jacob: *"It needs to be human fillable."* An input that only a script can satisfy is one that stays empty for town #3.

### 2.3 The gate
The pour refuses to run — or warns loudly and specifically — when a required input is absent. Today it pours regardless and the absence shows up later as a blank overlay or a missing grove.

---

## 3. The distinction that shapes the whole design

**Render-side inputs must be complete before the pour. Content-side inputs must not be required by it.**

- **Render-side** (baked into the slab, so re-acquiring means re-pouring): street geometry, building footprints, land-use/parcels, street lamps, trees, elevation.
- **Content-side** (joined to the slab by building id, afterwards, forever): place cards, listings, menus, logos, photos, historic records.

This is not a guess. It was verified on 2026-07-20: Księży Młyn's 84 listings, 23 cards, menus, logos and photos survived a complete re-fetch, a wider bbox and a rebuilt skeleton **untouched**, because they key on `osm-<wayid>` — a stable upstream identifier, not a position and not anything the pour computes.

**So the manifest covers render-side inputs. Content gets its own intake, later, and must never become a pour dependency.**

⚠️ **The invariant this rests on deserves an explicit test.** Content survives re-pours *only* because building ids are stable. Skeleton `skelId`s are **not** stable — they are `slugify(name)` plus a chain index, so a wider fetch can renumber them (`milionowa` → `milionowa-0`/`-1`). If building ids ever acquire the same property, the entire content layer silently orphans. Write the test.

---

## 4. ⭐ The standing constraint: local files, no live dependencies

Jacob: *"I have tried to keep files local to the extent that I can so as to not rely on networks (which can go down) and corporate entities (with whom I have lighthearted enmity)."*

**Every input is a file on disk, and a pour must be reproducible with the network unplugged.** Fetching is how a file is *acquired*, once; it is never how the pipeline *reads*. Design the manifest so acquisition and consumption are separate steps, and so the record of where something came from survives independently of the ability to re-fetch it.

This is already how the good parts work — `bake-terrain.js` reads `raw/elevation.tif` and doesn't care that USGS is the documented way to get one — and it's a large part of why Łódź was pourable at all. Preserve it. Prefer sources that permit a permanent local copy; note licence per input.

---

## 5. Verified findings to build on (2026-07-20)

- **`bake-terrain.js` is source-agnostic.** It reads `cartograph/data/<scene>/raw/elevation.tif` and samples any GeoTIFF against the scene's geography. USGS 3DEP appears only in comments and an error message. Non-US terrain is therefore an *acquisition* problem, not a code problem — but note the no-data sentinel at `bake-terrain.js:69` is USGS-specific and will need checking per source.
- **The pour does not run terrain.** `/pour` is `pipeline.js --skip-elevation` → `promote-ribbons` → Look → `bakeLook`. Elevation bakes separately, between the Design tools and Stage.
- **MSBF aborts off-continent** ("No US tiles found covering BBOX"), so non-US hoods fall back to OSM buildings. Expected degradation, but currently invisible in the manifest sense.
- **No parcel authority outside St. Louis City/County.** Also expected, also silent.
- **`raw/osm.json` is ways-only — no POI nodes.** Business density is therefore invisible to the fetched data; listings came from a separate pass. Worth declaring as its own input rather than assuming OSM covers it.
- **The area guard and the fetch buffer disagreed.** The server capped a fetch at 200 km² while `fetch.js` captured Overpass through a 50 MB pipe — a 33 km² fetch of Centrum returned 52.49 MB and threw with an unreadable error. Fixed (`2aa07e11`), but it is the pattern to watch for: two guards on the same thing, the tighter one invisible.

## 6. What to deliver

1. The manifest schema, grounded in what the bakes actually read.
2. The Intake panel — status, **Get**, **(?)** per input.
3. The pour gate.
4. The stable-building-id test (§3).
5. A short writeup of what a *complete* intake looks like for one real scene — use `centrum` (Łódź) or `ksi-y-m-yn`, both of which are non-US and therefore expose the assumptions LS never did.

## 7. Audience, and how done is done

Jacob: *"Assume it's me for the time being, but developer-accompanied for future installations that aren't me, until we stabilize the process enough to truly automate all of it."*

So the **(?)** copy is **provenance writing, not tutorial writing.** It does not need to teach a layperson GIS. It needs to be precise enough that Jacob plus an accompanying developer never have to re-derive where a file came from, what convention it follows, or how to tell a good one from a bad one. Aim there and it will still be the right text when this is automated.

**Definition of done:** a second person, handed a town name and this panel, can acquire every render-side input and pour a slab without reading the source and without asking Jacob a question.

---

## 8. Standing rules

- **Confirm alignment with Jacob before writing code.** This is the last structural piece of the kit; get the shape agreed first (`CLAUDE.md §Standup before code`).
- **Everything lives inside `lafayette-square.nosync/`.** No stray folders, no new dev servers — reuse the running one.
- **Less UI text, always.** Jacob's standing preference. The **(?)** is where explanation belongs; the panel itself stays terse.
- **Excise, don't accrete.** If this subsumes an existing script or knob, remove it — knobs, wiring and docs together.
- Name yourself in the writeup.
