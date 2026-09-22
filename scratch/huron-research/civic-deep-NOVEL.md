# Novel patterns — civic deep pass, 2026-09-22

Only what earlier beats have not already reported. (Skipped as already-known: simultaneous
schedules, academic-term hours, service times as instants, by-appointment state, last-entry
times, rule windows, link rot, closure calendars.)

---

## 1. ⛔ THE ASSIGNMENT'S LISTING IDS WERE ALL WRONG, AND EVERY ONE RESOLVED TO A REAL LISTING

Eight of the nine ids in my brief pointed at a different, existing business. `huro-lst-0170`
("BGSU Firelands College") is Custom Marine Inc.; `huro-lst-0193` ("City of Huron - Government")
is CUSH Cafe; `huro-lst-0134` ("Huron Fire Division") is Corner Cuts, a hair salon.

**The novel part is the failure shape, not the mistake.** The brief already carries a guard for
name drift — "`_match_name` must be copied verbatim, five records were nearly lost to paraphrased
names." That guard assumes **the id is the truth and the name is the soft field.** Here it was the
reverse. And because every wrong id hit an occupied slot rather than a missing one, a writer
keying on id alone would have silently written a fire department's history onto a hair salon.
⭐ **The name is the checksum on the id, as much as the id is the key for the name.** A merge step
should refuse any record whose `_match_name` does not equal the target's `name`, and it must treat
*mismatch* as fatal, not just *not found*.

## 2. ⛔ THE CONTAMINATION IS ALREADY IN THE SHIPPED FILE — AND IT CAME FROM A PRIOR RESEARCH BEAT

`huro-lst-0195` is named "Bowling Green State University, Firelands College" and currently carries
the **library's** description, hours, amenities and website. `scratch/huron-research/civic.json`
keys `huro-lst-0195` with `_match_name: "BGSU Firelands Library"` — which is not that record's
name. The library's real record, `huro-lst-0280`, holds the same content, correctly.

So the college and the library now read as the same place, and the college — prominence rank 7 —
has no description of itself at all. **This is instance #1 of the class in §1, already landed.**
It is also invisible to any check that asks "is the field empty?", because the field is full.
⭐ A `_match_name` ≠ `name` check over the existing `scratch/huron-research/*.json` would catch it
today, and would catch the rest of the class in town #3.

## 3. ⭐ A COMMONS CATEGORY NAMED FOR AN INSTITUTION CAN CONTAIN NO INSTITUTION

`Category:Bowling Green State University Firelands` holds eight CC BY-SA photographs. Every one is
one photographer's 2008 walk of the **grounds** — a pond, Canada geese and a mute swan, berries, a
garden bench. Commons' own sub-categorisation says so plainly ("Ponds in Ohio", "Gardens in Ohio",
"Branta canadensis with other species"). **Not one frame shows a building.**

The category name reads like a building set. An automated harvester that trusts the category name
would give a college campus a card photo of a duck. ⭐ **The usable signal is the SUB-categories,
not the parent** — Commons' sub-cats are effectively a machine-readable subject line, and
"Buildings in <town>" / "Church towers in <state>" is the membership to trust for a building
portrait. That generalises to every town: ask Commons for the *town's* building category, not the
*institution's* eponymous one.

## 4. ⭐ THE ONLY HISTORY A CITY GOVERNMENT PUBLISHES IS ITS FIRE DEPARTMENT'S

cityofhuron.org has no history page for the city, the municipal building, or the government. It
has a long, dated, carefully maintained history of the **Fire Division** — 1860 founding, the 1915
horse-drawn ladder wagon bought from Elyria, the "Blue Goose" Mack of 1934, the 1974 station move
— at `/government/safety_services/fire/history.php`, three levels down under Safety Services where
nothing links to it from the history-shaped part of the site.

This is worth a rule because it is almost certainly not local to Huron: **fire departments write
their own histories and municipalities do not.** ⭐ For any town, `<city site>/fire*/history` is a
higher-yield probe than the city's own About page — and the page is filed under the *department*,
so a crawler following an "About / History" nav will never reach it.

## 5. ⭐ WIX EXPOSES ONLY THE THUMBNAIL; THE ORIGINAL IS ONE PATH SEGMENT AWAY

Upside Down Art Studio's site serves every image as
`static.wixstatic.com/media/<id>~mv2.jpg/v1/fill/w_198,h_241,.../<original-filename>.jpg`.
Harvesting the `src` verbatim captures a ~200-pixel image. **Deleting everything from `/v1/`
onward returns the full-resolution original.**

Two bonuses fall out of the same URL. The tail of the transform path preserves the **original
filename**, which is often the only subject label a small-business site has — that is how
"youth studio.jpg" and "adult studio.jpg" were identified, and how two images were caught as
`Screenshot_..._Facebook.jpg` and `Screenshot_..._Canva.jpg` and excluded as screenshots rather
than photographs. It also carries a **date** (`20250222_163919.jpg`), which is the only freshness
signal such a site offers. ⭐ Wix, Squarespace and Shopify all use a transform-path CDN; the
general move is *strip the transform, then read the preserved filename as a caption*.

## 6. ⚠️ "NO PHOTO" NEEDS ITS SEARCH RECORDED, OR THE NEXT BEAT REDOES IT

Three of the nine places here genuinely have no findable photo: the post office, city hall and the
fire station. That result is only worth anything if the *search* is on disk, so I recorded
`_photos_searched` — the Commons category walk, the wrong-Huron results it returned, and the fact
that USPS's locator renders in JavaScript and yields nothing to a fetch. ⭐ Without it, an absent
`photos: []` is indistinguishable from a place nobody looked at, and town #2's next agent pays for
the same sweep. **A confirmed absence is a finding and should be shaped like one.**

## 7. ⚠️ WEBSEARCH BUDGET IS A SILENT CEILING ON A RESEARCH BEAT

This session's WebSearch budget (200/200) was already spent when I made my first call, so every
finding above came from endpoints I could *name in advance* — Wikimedia's API, the institutions'
own domains, a link-enumeration of each site's HTML. That worked well and is arguably the better
method anyway, but it means **discovery was structurally limited to places I already suspected**.
Anything with no guessable URL was out of reach. Worth knowing when reading the gaps: some of them
may be search failures wearing an absence's clothes.

Also retried as instructed: `huron.net` and `events.bgsu.edu` were not needed and not fetched.
`npgallery.nps.gov` **was** tried for the Christ Episcopal NRHP nomination (ref 75001379) — both
the `_text` and `_photos` asset patterns returned HTTP 404, so the federal public-domain
nomination photos and the architect/style attribution remain unobtained.
