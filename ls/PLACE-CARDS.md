# LS — Enhanced Place Cards & the Society Pages

The neighborhood directory and the rich card behind every place. This is the reference for **what a place card holds** — every data field, the menu/delivery model, and how a card gets authored. For the pitch see [`FEATURES.md`](FEATURES.md); for the operator/guardian procedures see [`OPERATIONS.md`](OPERATIONS.md); for endpoint/data-source catalogs see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md) + [`reference/INVENTORY-DATA.md`](reference/INVENTORY-DATA.md). Delivery **economics + the courier system** live in the Cary docs ([`../CARY-BRIEF.md`](../CARY-BRIEF.md), [`../cary/`](../cary/)) — not duplicated here.

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is

**The Society Pages** (a.k.a. "Lafayette Pages", the **Society** tab) is the neighborhood directory — every place, grouped by category, searchable. Browsing the directory is **public** (no gate on the `lafayettepages` tab); becoming a **townie** unlocks *participating* (reviews, bulletin, DMs) — see [`TOWNIES.md`](TOWNIES.md). The tab + directory live in `src/components/SidePanel.jsx` (`SocietyMasthead`, `SocietyInlineSearch`, the `lafayettepages` tab; category → subsection → place accordion).

Opening any place gives a **place card** (`src/components/PlaceCard.jsx`). Its tabs are content-driven: **Overview · Reviews · Architecture/Property · Photos · Ticker (events) · Menu · Lobby** (a tab appears only when the place has that content / the viewer qualifies).

### Three kinds of card
- **Business place card (enhanced)** — a business has claimed the listing; shows the full authored card (logo, photos, hours with a live open/closed indicator, **menu + delivery**, reviews, events, contact). This is what §2–§3 below mostly describe.
- **Resident place card** — a *residential* place (`category === 'residential'`, or any bare building viewed as a home). It drops the business surfaces (no menu/delivery/reservation) and adds residential ones: a **rent range** (`building.rent_range`, `PlaceCard.jsx:821`) and — for a verified resident of *that* building — the private **Lobby** tab. ⚠️ A "Resident place card" (this card *kind*) is **not** the same thing as the **Residents** role/system: the card is documented here; the residency mechanics (claim, the four verify paths, the lobby gates) live in [`RESIDENTS.md`](RESIDENTS.md).
- **Auto-synthesized / bare** — *every* building opens, even unclaimed: LS builds a read-only card from the building's own architectural record (year built, stories, style, zoning, historic status, square footage) so nothing in the neighborhood is a dead pixel. Architectural facts + facade photos come from `src/data/facade_mapping.json`.

---

## 2. The data model — every field

**Canonical column order** is the `row()` header in `apps-script/Code.js` (~line 2072). The backend serializer (`getListings`, ~line 326) parses the `*_json` columns into objects and **strips the secrets** (`guardian_hash`, `guardian_token`, `claim_secret`, and the raw `*_json`) from the public response, adding a derived `has_guardian`.

### Core columns (stored flat)
| Field | Type | Example | Notes |
|---|---|---|---|
| `id` | string | `"lmk-010"` | Unique listing id |
| `building_id` | string | `"bldg-0376"` | FK to buildings; a bare building auto-synthesizes a read-only card |
| `name` | string | `"Polite Society"` | |
| `address` | string | `"1923 Park Ave"` | |
| `category` | string | `"dining"` | `dining · services · shopping · arts · community · historic · residential` |
| `subcategory` | string | `"restaurants"` | `restaurants · cafes · bars · galleries · beauty · medical · grocery · schools · churches · landmarks · notable-homes` … |
| `phone` | string | `"(314) 325-2553"` | optional |
| `website` | string | `"https://www.politesocietystl.com"` | optional |
| `description` | string | `"A restaurant, bar & gathering place…"` | optional, long-form |
| `logo` | string (path) | `"/logos/polite-society.png"` | optional; falls back to initials |
| `home_based` | boolean | `false` | residential indicator |
| `status` | string | `"active"` | `pending · active · removed` (removed = hidden from the directory) |
| `rating` | number | `4.7` | external rating (e.g. Google), optional |
| `review_count` | number | `1555` | external review count, optional |

### Rich columns (stored as JSON, served parsed)
| Field (served) | Stored as | Shape | Purpose |
|---|---|---|---|
| `hours` | `hours_json` | `{ <weekday>: { open:"HH:MM", close:"HH:MM" } }` — a day omitted = closed | drives the live open/closed indicator |
| `amenities` | `amenities_json` | `string[]` (`"Full bar"`, `"Outdoor seating"`, …) | |
| `tags` | `tags_json` | `string[]` — feature/amenity ids + `subcat-*`; **includes `takeout` / `delivery`** (these toggle service) | |
| `photos` | `photos_json` | `(string \| { url, credit, credit_url })[]`; path convention `/photos/<slug>/01.jpeg` | gallery + lightbox |
| `history` | `history_json` | `{ year:number, event:string }[]` | timeline |
| `menu` | `menu_json` **+** bundled `src/data/menus.json` | see §3 | menu + delivery — **the part with no prior docs** |

### Guardian / lifecycle (server-side; secrets stripped from the public response)
`created_by` · `accepted` / `accepted_at` (admin gate) · `guardian_hash` / `guardian_token` (the claiming device) · `claim_secret` (8-char hex printed on the physical QR card) · `created_at` / `updated_at`. Derived for the client: **`has_guardian`** (and `is_claimed`).

---

## 3. The menu & delivery model

The menu drives both the **Menu tab** and **delivery ordering**. It is the richest sub-model and had no documentation before this doc.

### Where menus live (important)
There are **two sources**, and the bundled file wins:
1. **`src/data/menus.json`** — the curated set, keyed by listing id. Merged at boot in `src/hooks/useListings.js:22`:
   ```js
   menuData[lm.id] ? { ...lm, menu: menuData[lm.id] } : lm
   ```
   This **overrides** any GAS `menu_json` for those listings. As of 2026-06-29, **10 listings** carry a curated menu: `lmk-001` Square One · `lmk-003` Extra Wavy · `lmk-008` The Bellwether · `lmk-010` Polite Society · `lmk-011` Baileys' · `lmk-012` 33 Wine · `lmk-021` Winnie's · `lmk-027` SqWires · `lmk-028` Eleven Eleven · `lmk-040` Clementine's.
2. **GAS `menu_json`** — the guardian-edit channel (a guardian editing a menu writes here via `update-listing`). Used for any listing **not** in `menus.json`.

> ⚠️ Because the bundled file overrides GAS, guardian menu edits to one of the 10 curated listings are currently shadowed by `menus.json`. (Noted as-built; reconcile when guardian menu-authoring goes broadly live.)

### Menu shape
```js
menu = {
  taglines: { <menuType>: "coastal flavors on Mississippi Ave" },   // per-type subtitle
  schedule: { <menuType>: { <day>: { start:"17:00", end:"22:00" } } }, // per-type availability = the delivery window
  sections: [
    {
      name: "Raw",            // section heading
      menu: "dinner",         // which menuType this section belongs to
      items: [
        {
          name: "Oysters",
          description: "Pink peppercorn, mignonette",
          price: 2400,        // integer CENTS ($24.00)
          tags: ["gf"],       // dietary: gf | v | vg  (rendered GF / V / VG)
          modifiers: [        // optional add-ons / size variants, price = cents DELTA
            { name: "6 pc",  price: 0 },
            { name: "12 pc", price: 4200 }
          ]
        }
      ]
    }
  ]
}
```
- **Menu types** (`MENU_ORDER`, `PlaceCard.jsx:2827`): `all_day · lunch · dinner · brunch · drinks · dessert · happy_hour · specials · market`. Unknown keys render as custom pills.
- **All prices are integer cents.** `modifiers[].price` is a delta (can be 0).
- **`schedule` is the delivery window.** A menu type is orderable only when "now" falls inside its `{start,end}` for the current `day`; a day omitted = unavailable. `taglines` are cosmetic subtitles per type.

### Delivery gating
Ordering from a card is gated by **all** of:
- the listing carries the **`delivery`** tag (guardian-toggled via `ServiceToggles` → `update-listing`),
- a courier is available (`useCourierAvailable()` reads live Cary state from Supabase),
- the chosen menu type is **currently in its schedule window**.

A guardian is warned when a menu has no `schedule` ("won't be available for delivery until you set its hours"). The cart enforces a **$40 minimum**. The end-to-end order flow is a "coming soon" placeholder today (`CaryButton`); the fare/fee/tax math + the courier system are **Cary's**, documented in [`../CARY-BRIEF.md`](../CARY-BRIEF.md) and [`../cary/`](../cary/) — see Cary for the economics rather than reading them off `PlaceCard.jsx`.

---

## 4. Authoring — claim, guardians, permissions

A business owner claims their listing by scanning the **physical QR card** posted at the location; the `claim_secret` on it proves presence. The first claimant becomes the **guardian** (full control). Anyone they add is a **keyholder** with exactly the per-field permissions the guardian grants — `menu · hours · photos · replies · events`. Guardians edit inline (hours, photos, logo, tags/category, menu, events), reply to reviews, post events, and manage staff. **All edits are gated server-side** (the backend re-verifies the caller against the Guardians sheet), not just in the UI.

Procedures + the role/permission matrix live in [`OPERATIONS.md`](OPERATIONS.md) (Roles & gates; "Claiming a listing"). Endpoints: `claim`, `update-listing`, `upload-photo` / `remove-photo`, `event`, `reply`, `update-staff-perms`, `promote/demote/revoke-staff` (see [`reference/INVENTORY-API.md`](reference/INVENTORY-API.md)).

---

## 5. Data flow (at a glance)

- **Boot:** `useInit` / `useListings` load the `listings` action (GAS), then merge bundled `src/data/landmarks.json` + **`src/data/menus.json`** + `seedEvents.json`. The merge attaches `menu` from the bundled file (overriding GAS for the curated 10).
- **Backend:** Google Apps Script (`apps-script/Code.js`) — `getListings` serializes `*_json` → objects, strips secrets. Guardian writes go through `update-listing` (and friends). Reviews/events are per-listing fetches. Courier state is **Supabase** (Cary).
- **Auto-cards:** unclaimed buildings draw architectural facts + facade photos from `src/data/facade_mapping.json`.

---

## Source map
| Thing | File | Key lines |
|---|---|---|
| Society tab / directory | `src/components/SidePanel.jsx` | tab `lafayettepages` (~781); masthead/search (~577–626); accordion (~628–709); place select (~454–468) |
| Place card (all tabs) | `src/components/PlaceCard.jsx` | header ~2655; tab nav ~2768; Overview ~816; Hours ~450; Photos ~1548; Reviews ~1221; Menu ~2829 |
| Menu types | `src/components/PlaceCard.jsx` | `MENU_ORDER` 2827 |
| Curated menus | `src/data/menus.json` | merge `src/hooks/useListings.js:22` |
| Data model (canonical) | `apps-script/Code.js` | `row()` header ~2072; `getListings` serializer ~326 |
| Society Pages unlock | `src/pages/CheckinPage.jsx` | ~340–346 |
| Facade / auto-card source | `src/data/facade_mapping.json` | — |

*New doc, 2026-06-29 — closes the documentation gap on the Society Pages + the menu/delivery data model. Reference-kind: when the schema changes, update the field tables + the source map; keep economics in the Cary docs.*
