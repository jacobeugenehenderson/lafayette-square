# Legal-Readiness Brief — Lafayette Square Deliveries

**What to walk into the lawyer's office already knowing.** Synthesized from a verified multi-source research pass (2026-06-20); rests mostly on primary Missouri statutes/regulations + official .gov guidance (high confidence), with the cross-state classification map partly on secondary aggregators (lower confidence — flagged).

> ⚠️ **Orientation, NOT legal advice.** Confirm every point with a Missouri-licensed attorney + tax professional before relying on it. Two items are explicitly the lawyer's to resolve (§A).

---

## A. The two things to actually hand a lawyer

1. **Marketplace-facilitator remittance — an EARLY (pre/near-launch) DOR letter ruling.** *Who* collects and remits Missouri sales/use tax on the food subtotal, given the Platform takes no commission, the restaurant is merchant of record, and the Platform only transmits payment? No Missouri DOR ruling addresses this unusual model. **Why it's urgent, not someday:** the nexus threshold is measured on *facilitated food sales*, not the Platform's fee, so it's crossed in **months** (see §B). Request a letter ruling early so the remittance machinery (or the confirmation that the restaurant remits) is settled before it bites.
2. **Alcohol — transporter permit / local ordinance check.** Does the Platform itself need any Missouri transporter permit to *deliver* alcohol as the restaurant's agent, or do local St. Louis ordinances add third-party-delivery requirements beyond RSMo 311.202 / 311.300? Baseline appears to be: restaurant's retail license + courier 21+ + door-side ID check is sufficient, with the Platform holding no liquor license — confirm.

---

## B. Marketplace-facilitator sales tax (RSMo 144.752)

- **You probably ARE a marketplace facilitator.** The statute's two prongs (both met): you (a) list/advertise taxable sales **and** (b) collect the customer's payment and transmit *all or part* of it to the seller. **"No commission" does not exempt you** — the law keys on transmitting "all or part," not on taking a cut. The "mere payment processor" carve-out is narrow (only an appointed third-party *financial institution* whose *sole* role is payment) and doesn't apply.
- **The threshold is the *facilitated food subtotals*, measured gross** — NOT your revenue, the service charge, your 25% cut, or profit. **$100,000** in gross receipts from facilitated taxable sales, rolling 12 months, assessed each quarter-end, **no transaction count**.
- **The slice (why it's reached fast):** your take = 25% × 22% = **5.5% of the food subtotal**; courier = 16.5%. So $100k of facilitated food = $22k service charge → ~$5,500 to you. The obligation can attach when *you've* earned only ~$5,500.
- **Realistic timeline:** at neighborhood order values (≈$100 blended AOV; a $200 meal-for-four is unremarkable), $100k = ~1,000 orders. A handful of restaurants doing ~15–20 orders/day total hits it in **~2 months** — *near-launch, not at-scale.*
- **If/when crossed:** register with the Missouri DOR and collect/remit use tax on facilitated sales (Jan 1, 2023 onward, SB 153/97). Local-rate sourcing + who-remits = the letter-ruling question (§A1).

## C. Alcohol delivery (RSMo 311.202, 311.300, 311.328)

- **Courier must be 21+** to deliver intoxicating liquor away from the licensed premises (RSMo 311.300.2). *(Confirms the new 21+ gate; the old single "16+" silently conflicted.)*
- **Restaurant pathway (to-go law, RSMo 311.202):** permitted only with a **simultaneously-ordered on-premises meal**; container **filled & sealed by the restaurant's 21+ staff** (tamperproof, transparent, securely sealed/ taped; rigid/leakproof; volume cap); **drinks limited to ~2× the number of meals** *(confirm exact ratio/oz with ATC)*. So: food-and-drinks-for-the-table = fine; drinks-only or drinks-≫-meals = not. **Encode `drinks ≤ ~2× meals` as a hard checkout rule.**
- **Package-store pathway:** an off-premises retail liquor licensee can sell sealed packaged alcohol **without a meal requirement** — standalone alcohol delivery *is* possible, just sourced from a package store, not a restaurant.
- **Platform holds no liquor license** — the Sender is the licensed seller; the courier is delivery + door-side ID check only.
- **Door-side ID (RSMo 311.328):** compare photo + physical characteristics on a valid unexpired government ID; refuse if underage/intoxicated. IC status does not exempt this.

## D. Worker classification

- **Your design is your strongest classification asset.** Across every test, the controls that push toward *employee* are: set schedules, mandatory acceptance rates, penalties for declining/cancelling, supervision (incl. electronic/app), discipline/deactivation rights, rate control, limits on working elsewhere. **Your self-claim queue, no algorithmic dispatch, no quotas, no decline penalties, capacity-first matching = the protective profile.** Preserve it in contract *and* in operation (the operational reality is what gets tested, not the label).
- **Missouri:** common-law right-to-control (IRS 20-factor). Friendly forum.
- **Federal FLSA:** six-factor economic-reality test (no ABC). *In flux* — DOL stopped enforcing the 2024 rule (May 2025) and proposed a replacement (Feb 2026); but "degree of control" survives every version, and the 2024 rule still governs private litigation.
- **California — the correction.** The default is the strict **ABC test (AB 5)** — **BUT app-based delivery couriers are carved out by Prop 22**, upheld by the CA Supreme Court in July 2024 (*Castellanos v. State*). So CA couriers **can** be ICs — **only if** you provide Prop 22's benefits: net-earnings floor (~120% of local min wage for engaged time) + per-mile reimbursement, healthcare stipend scaled to engaged hours, occupational-accident insurance. (Earlier I framed CA's ABC test as a wall forcing a co-op; that was wrong — Prop 22 keeps the IC path open if funded. A co-op/mutual-aid model remains a *choice*, not a necessity.)
- **Funding Prop 22 — cheap for this model, and on-brand.** High AOV + tiny geography keep engaged-time pay far above the ~$21 floor, so the earnings-floor top-up ≈ $0 and engaged-mile reimbursement ≈ pennies. The only real recurring cost is a **healthcare stipend** (owed to couriers averaging 15+ engaged hrs/wk) + **occupational-accident insurance** (per-courier policy). **Fund it consumer-side via a transparent dedicated "Courier Benefits" pass-through that the Platform takes $0 of** — a benefits *pool* (flat-per-order ≈$0.50–1.00, or a 2–3% CA-only service-charge uplift, reconciled quarterly). **Never fund from the courier's cut** (self-defeating; poisons the trust core — courier keeps 75% + 100% tips *and* gets the benefits). In a community neighborhood — post-fire Altadena especially — *"helps cover your courier's healthcare & injury coverage"* reads as **solidarity, not a junk fee**; the non-extractive model is what makes the transparent pass-through credible. (See `rider-template.md` → *Funding Prop 22*.)
- **Gig minimum-pay mandates (plan per operating city):** Seattle (per-offer/per-mile minimum), NYC (~$21–22/hr **excl. tips**, rising), California (Prop 22 floor). Apply where you operate, not where based; figures adjust annually.

## E. Open questions (beyond the two lawyer items)
- Local STL third-party-delivery / restaurant-consent / fee-disclosure ordinances?
- Exact Prop 22 current-year dollar figures before any CA launch.
- For all-deliveries: peer-sender (non-sale) parcel liability + the prohibited-goods schedule per state.

## F. Caveats
- Orientation, not advice — confirm before reliance.
- FLSA framework may shift in 2026 (control factor survives regardless).
- Gig-pay figures and the alcohol ratio/cap are current-value items — verify the live number.
- The cross-state classification list leaned partly on secondary aggregators (one verified only 2-1); treat any single state's test as a starting point. NY notably uses different tests for different purposes.
- The MO facilitator reading is a strong plain-text reading; **no DOR ruling** applies it to a zero-commission, not-merchant-of-record food platform → hence the letter ruling.

## G. Primary sources
- RSMo 144.752 (marketplace facilitator); Missouri DOR remote-seller/facilitator FAQ; SB 153/97.
- RSMo 311.202 (to-go), 311.300 (delivery age 21+), 311.328 (ID); Missouri ATC Liquor Lawbook.
- US DOL WHD FLSA classification FAQ (2024 rule); Missouri DES IRS 20-factor.
- *Castellanos v. State*, S279622 (Cal. 2024); AB 5 / Prop 22.
- Seattle Office of Labor Standards; NYC DCWP minimum-pay rule.

*Authored 2026-06-20 from verified research. Not legal advice. See `rider-template.md` for the per-instance values this brief feeds.*
