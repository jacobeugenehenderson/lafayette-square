# Lafayette Square's listings left src/data/landmarks.json — SUPERSEDED 2026-09-24

Installation #1 kept its listings in `src/data/landmarks.json` while every poured town keeps them in `cartograph/data/<scene>/content/listings.json`, and its Apps Script `Listings` tab held a full second copy seeded in Feb–Mar 2026. The two had drifted (34 differing fields). Consolidated into `cartograph/data/lafayette-square/content/listings.json`: the file's 87 listings with the live sheet's edits to those listings laid over, merged as `useInit#runInit` merges; the sheet's bookkeeping fields are not content. Proved against the live sheet: the live site's merged listings, directory order and map pins are identical before and after (98 shown).

⛔ Not carried over: 11 sheet-only rows. 8 are places the file removed on purpose (lmk-034/020 in "Trim map boundaries to Lafayette Square neighborhood", 2026-02-09; lmk-018 2026-02-11) and 3 are empty rows (lmk-065/066/067). The live site still shows all 11 because the sheet still has them — removing them is a change to the production sheet, left for Jacob.

The old file is `cartograph/_archive/landmarks-SUPERSEDED-2026-09-24.json`. The one-off Feb 2026 scripts that edited it moved to `scripts/_archive/`. Replaced wording:

## src/hooks/useListings.js

>  * Seeded from the bundled landmarks.json so the scene has places to draw, then

## src/cartograph/SurveyorPanel.jsx

> exactly this: LS resolves to landmarks.json, HPDM to its own

## apps-script/Code.js

>     // Extra businesses not in landmarks.json

## PUBLISH.md

> | Listings | All landmark/business data (synced from `landmarks.json` on init) |

## ls/reference/INVENTORY-API.md

> | Listings | All landmark/business data (synced from `landmarks.json` on init) |

## ls/reference/INVENTORY-API.md

>   useListings  ← landmarks.json + menus.json + GAS listings

## ONBOARDING.md

> A real card (see LS `Polite Society`, `src/data/landmarks.json`)

## NEIGHBORHOOD-INPUTS.md

> ### 4.2 Landmarks / listings — `src/data/landmarks.json` (87)

## EXTENT-DESIGN.md

> paths** — `src/data/ribbons.json`, `src/data/buildings.json`, `src/data/street_lamps.json`,
> `src/data/landmarks.json`, `src/data/park-feature-elev.json` — **imported by literal name**

## ls/ARCHITECTURE.md

> | `src/data/landmarks.json` + `src/data/menus.json` | `useInit`, `useListings` | Static catalog merged with GAS state; keep live |

## ls/ARCHITECTURE.md

> 3. Merges static `landmarks.json` + `menus.json` into the listings store

## ls/PLACE-CARDS.md

> then merge bundled `src/data/landmarks.json` + 

## ls/reference/RUNTIME-DELTA.md

> | `src/data/landmarks.json` (+31 lines) |

## ls/reference/INVENTORY-DATA.md

> | Landmarks catalog | `src/data/landmarks.json` |
