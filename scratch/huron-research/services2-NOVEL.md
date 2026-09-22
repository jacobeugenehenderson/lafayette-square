# NOVEL — services remainder (the hard 74)

Input kinds our listing schema cannot hold, stated town-agnostically. The already-reported kinds
(by-appointment as a third state, booking-platform calendars, per-practitioner schedules, seasonal
hours, on-call 24/7, service-area dispatch, relative "open today" strings, bot-blocking, private
hours, holiday-closure tables, home-based sole proprietors, dedupe errors in both directions) are
NOT repeated here.

---

## 1. The hours that exist belong to a HOST business, not to this listing
A kiosk, a cage, an agency counter or a franchise dealer occupies someone else's premises and has
no hours of its own. Its real availability is exactly the host's opening hours, and it disappears
when the host shuts.

Observed here four times over — a Western Union counter and a Redbox kiosk inside a Dollar General
store; a U-Haul Neighborhood Dealer operating out of a used-car lot; propane exchange cages standing
outside filling stations. In two cases the listing's own phone number *is* the host's phone number,
which is how the pairing was proved.

The schema has only `hours`, so the honest fact has two bad outcomes and no good one: write the
host's grid and it silently reads as this business's own (and stops being true the day the host
moves or closes), or write nothing and lose a fact a resident actually wants. **What is missing is a
way for one listing's availability to POINT AT another listing's** — a host reference, so the hours
resolve through the host and stay correct when the host's change. ⭐ For town #2 this is not a fuel
story: it is every franchise-inside-a-store in any town, and there is no way to detect it by looking
at the record alone.

## 2. An UNATTENDED facility that is genuinely open, with a daylight rule instead of clock times
`huro-lst-0087` resolves to a privately owned, public-use turf airstrip. Its authoritative record
says `UNATNDD` (nobody is on site, ever) and `ARPT CLSD AT NGT`.

Both halves break the schema. **"Unattended" is not "closed"** — the place is open to the public and
you may use it; there is simply no staff, so the open/closed axis does not describe it. And
**"closed at night" is a sunrise/sunset rule, not a weekly grid** — it is a different clock every
day of the year, and any attempt to write it as `06:00–20:00` bakes in a season the way a relative
"open today" string bakes in a weekday. Boat ramps, self-serve wash bays, trailheads, transfer
stations and unstaffed park facilities all carry one or both properties.

## 3. A rebranded business arrives as TWO listings, old brand and new, and both are correct
`huro-lst-0089` ("n2y") and `huro-lst-0111` ("Everway") are one company: n2y merged with Texthelp and
renamed, and `n2y.com` now 308-redirects to `everway.com`, which states "Formerly n2y and Texthelp"
on its own homepage. Neither record is wrong; one is simply superseded.

⛔ This is NOT the already-reported dedupe pair, because the resolution is different: the two records
are not two views of one place to be merged or kept apart on the evidence — one NAME has replaced the
other in the world, and residents still searching the old name need to land on the new. The schema has
no `formerly_known_as`, so the rename is unrecordable and the choice collapses to keeping a stale
listing or deleting a name people still use. ⭐ The detector is cheap and town-agnostic: **a held URL
that permanently redirects to a different registrable domain is a rename signal**, and it fired on
three separate listings in this batch (n2y→Everway, humaneticsatd→humaneticsgroup, carmeusena→carmeuse).

## 4. A first-party NEGATIVE — the operator's own site does not list this location
For `huro-lst-0038`, the parent company's own North American locations map enumerates five Ohio sites
and this town is not among them. That is a much stronger and much more useful statement than "hours
not found", and it is the single best evidence of a dead listing that research can produce short of
going there. ⛔ But it is not proof of closure, and the schema has nowhere to put it: the record ends
up looking identical to one that was merely hard to research.

What is missing is a **provenance-negative** — a way to record "the authoritative source was reached
and it does not know about this place." ⭐ Town-agnostically this is the cheapest liveness check the
kit could own for chain and multi-site listings: fetch the operator's locations page and ask whether
the town appears. A listing the operator itself omits should surface loudly, not sit looking normal.

## 5. The operator's own marketing contradicts the listing's TOWN
`huro-lst-0002` carries a Huron street address, and its operator's official page for the same property
states it is in the neighbouring city — almost certainly a marketing choice (the sister attraction is
famous and in that other city), not a postal fact.

⭐ This one is aimed squarely at the kit rather than at the schema. **Town membership is the axis the
whole pour is keyed on**, and here a first-party source disagrees with it. An enrichment pass that
trusts the operator's page over the address would quietly evict a real anchor business from the town;
one that trusts the address and copies the operator's prose would ship a description naming the wrong
town. Neither failure is visible on inspection of the finished map. A cross-town business — a resort,
a hospital, an airport, an industrial park on a boundary — will hit this in any town, and the record
has no field in which to say "the operator and the address disagree about where this is."

## 6. A soft redirect makes "this page does not exist" undetectable by status code
*(carried up from part D, `huro-lst-0277`.)* Guessing a booking-platform slug from a listing's display
name resolved to nothing real — but the platform 302-redirected to its own generic marketing homepage
rather than returning 404. A liveness check reading status codes sees 200 and real content and passes.
⛔ Any pipeline that validates held URLs by status alone will mark these live. The check has to assert
the page mentions the business.
