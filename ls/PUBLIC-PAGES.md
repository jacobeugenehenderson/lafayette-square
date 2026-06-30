# LS — Public-facing pages (privacy & terms)

The standalone legal/terms pages the app serves at public URLs. Today these are **hard-wired** — the text lives inline in code, with no authoring layer. This doc maps what they are, what they say, and the fact that they duplicate fee/economics language that also lives elsewhere. Related: [`CARY.md`](CARY.md) + [`../CARY-BRIEF.md`](../CARY-BRIEF.md) (courier program/legal), [`PLACE-CARDS.md`](PLACE-CARDS.md) §3 (the same delivery fee schedule).

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What they are

Three full-screen standalone pages (not part of the app shell), routed in `src/App.jsx` and rendered from `src/pages/LegalPage.jsx`:

| Route | Component | Content |
|---|---|---|
| `/privacy` | `PrivacyPage` | Privacy policy |
| `/terms/courier` | `CourierTermsPage` | Courier agreement (from `CourierOnboarding`'s `AGREEMENT_SECTIONS`) |
| `/terms/restaurant` | `RestaurantTermsPage` | Restaurant / "Lafayette Square Deliveries" agreement |

They're shown during onboarding (the courier agreement step in `CourierOnboarding.jsx`; the restaurant terms a Guardian accepts) and as footer/legal links.

## 2. ⚠️ They're hard-wired

The legal copy is **inline JSX + data structures** in `LegalPage.jsx` (and `AGREEMENT_SECTIONS` imported from `CourierOnboarding`). There is **no CMS, sheet, or authoring surface** — editing a clause means a code change + redeploy. (Jacob's read is correct.) This is the natural candidate if/when public docs should become operator-editable.

## 3. What the restaurant terms encode (and the duplication to watch)

The Restaurant Agreement (`LegalPage.jsx`) states the platform model and the **fee schedule** in legal language:
- Marketplace / technology-only; **restaurant keeps 100% of the food subtotal + sales tax** (no commission on food).
- **Service charge = 22% of the food subtotal**, split **75% courier / 25% platform**; **$40 minimum** order before tax/fees (§5.1).
- A **"Right to Modify Fees"** clause (§5.2) reserving the right to change the percentage/split/minimum.
- Guardian = the authorized manager who maintains the listing/menu; restaurant controls availability; alcohol/indemnity/liability allocations.

> **Duplication to reconcile:** these exact numbers (22% / 75-25 / $40) also live in the client cart math (`PLACE-CARDS.md` §3, `PlaceCard.jsx`) and the Cary program docs (`CARY-BRIEF.md`). The **legal page is the public, canonical statement**; the others should agree with it. If the fee schedule ever changes, it must change in all three. The deeper agreement corpus is `cary/legal/` — `LegalPage` renders a public subset.

## Source map
| Thing | File | Notes |
|---|---|---|
| The three pages | `src/pages/LegalPage.jsx` | `PrivacyPage` · `CourierTermsPage` (211) · `RestaurantTermsPage`; `AGREEMENT_SECTIONS` for restaurant terms |
| Courier agreement source | `src/components/CourierOnboarding.jsx` | `AGREEMENT_SECTIONS` (imported by LegalPage) |
| Routes | `src/App.jsx` | `/privacy` 622 · `/terms/courier` 623 · `/terms/restaurant` 624 |
| Deeper legal corpus | `cary/legal/` | courier/sender/rider agreements, org structure, readiness |

## Open item
Public legal copy is hard-wired across `LegalPage.jsx` + `CourierOnboarding`, and the fee schedule is stated in three places (legal page · client cart · Cary docs). Worth: (a) deciding whether these should become operator-editable, and (b) a single source for the fee numbers. Not urgent; noted for the backlog.

*New doc, 2026-06-29. Reference-kind: when a public page's content or routing changes — or if they move off hard-wiring — update §1–§3 + the source map.*
