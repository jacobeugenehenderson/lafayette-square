# Per-Jurisdiction Rider

**The schedule that fills the `‹rider›` blanks in the core agreements for one instance.** The agreements are jurisdiction-neutral; this rider supplies the values that change by place. Filling a rider (with local counsel) is what makes a new neighborhood launchable — it is the legal half of the per-instance `INSTANCE` config in `src/instance.js`.

> ⚠️ Draft / orientation — not legal advice. **Missouri / Lafayette Square** is filled from researched values (see `legal-readiness-brief.md`); **California / Altadena** is stubbed and must be completed by California counsel before any launch there. Every other jurisdiction starts blank.

---

## How to use
1. Copy the table for the new instance.
2. Fill each row with local counsel; resolve the open items first.
3. Wire the per-instance fixed-truth (name, geography, contacts) into `src/instance.js`.
4. Propagate the filled values into the rendered agreements (until the SSoT refactor lands, by hand).

A neighborhood does **not** launch until its rider is filled and its open items resolved. That discipline is the good-faith posture — "we did the homework for *this* place before we showed up in it."

---

## Rider — Lafayette Square, St. Louis, Missouri  *(FILLED)*

| # | Variable | Value |
|---|---|---|
| 1 | **Instance name** | Lafayette Square Deliveries |
| 2 | **Operating entity** | Jacob Henderson LLC (DBA Lafayette Square Deliveries) |
| 3 | **Service area** | Chouteau Ave → I-44; Jefferson Ave → Truman Pkwy; incl. adjacent buildings |
| 4 | **Governing law & venue** | State of Missouri; courts of competent jurisdiction in Missouri; small claims where applicable |
| 5 | **Worker-classification regime** | **Common-law right-to-control** (IRS 20-factor; MO DES). Friendly forum. Self-claim queue + no acceptance quotas + no decline penalties = the protective design to preserve. |
| 6 | **Age gates** | Deliver 16+ (no motor vehicle) · Drive 18+ · **Alcohol 21+** (RSMo 311.300.2) |
| 7 | **Alcohol — restaurant pathway** | RSMo 311.202: meal-attached, simultaneous on-premises meal; sealed/tamperproof; **filled & sealed by Sender's 21+ staff**; drinks **≤ ~2× meals** + volume cap *(confirm exact ratio/oz with ATC)*; off-premises consumption |
| 8 | **Alcohol — package-store pathway** | Off-premises retail licensee; **no meal requirement**; 21+ courier; door-side ID check (RSMo 311.328) |
| 9 | **Alcohol — Platform license** | **None** — Platform is delivery-only; Sender is the licensee. *(Open: any MO transporter permit / St. Louis local ordinance — see brief.)* |
| 10 | **Sales tax / marketplace facilitator** | RSMo 144.752. Threshold **$100,000 gross receipts from facilitated *food subtotals*** (NOT the fee), rolling 12 mo, quarterly, no transaction count. **Reached in months at neighborhood AOV.** *(Open: who remits on zero-commission / not-merchant model → early DOR letter ruling.)* |
| 11 | **Fee-disclosure law** | Standard; no all-in-pricing mandate currently. (Disclose service charge clearly at checkout.) |
| 12 | **Gig minimum-pay / benefit mandates** | **None** in Missouri. |
| 13 | **Insurance** | Motor-vehicle couriers: legally-required + delivery-use coverage. Platform carries its **own** CGL + contingent/non-owned auto (separate from courier indemnity). |
| 14 | **Restricted/prohibited goods** | Prepared food + sealed retail goods. Alcohol per rows 7–9. *(Prohibited: tobacco, cannabis, Rx, firearms, hazmat — until separately licensed/scoped.)* |
| 15 | **Fee schedule** | Service charge 22% of subtotal; split 75% courier / 25% Platform; minimum order $40 before tax & fees |

---

## Rider — Altadena / Los Angeles County, California  *(STUBBED — California counsel required)*

| # | Variable | Value |
|---|---|---|
| 1 | **Instance name** | *(TBD)* |
| 4 | **Governing law & venue** | California *(note: CA worker- and consumer-protection law generally cannot be contracted around — the courier relationship is governed by CA law regardless of any home-state choice)* |
| 5 | **Worker-classification regime** | Default is the **ABC test (AB 5)** — BUT app-based delivery couriers are **carved out by Prop 22** (upheld 2024, *Castellanos v. State*). Couriers can stay ICs **only if** the Platform provides Prop 22's benefits (row 12). |
| 6 | **Age gates** | Deliver / Drive per CA law *(confirm)*; **Alcohol 21+** (CA ABC Act) |
| 7–9 | **Alcohol** | CA ABC rules + 2021+ to-go/delivery law; confirm meal-attachment, licensee fill/seal, courier age, ID. CA has its own third-party-delivery alcohol regime — confirm with CA counsel/ABC. |
| 10 | **Sales tax / marketplace facilitator** | CA marketplace-facilitator law (CDTFA); confirm threshold + who remits. |
| 11 | **Fee-disclosure law** | **SB 478 (eff. July 2024) — mandatory all-in pricing.** The 22% service charge must be disclosed all-in; confirm compliant presentation. |
| 12 | **Gig minimum-pay / benefit mandates** | **Prop 22 package:** net-earnings floor (~120% of local minimum wage for engaged time) + per-mile expense reimbursement; healthcare stipend scaled to engaged hours; occupational-accident insurance. *(Confirm exact current-year figures.)* |
| 13 | **Insurance** | Per CA + Prop 22 occupational-accident requirement. |
| 14 | **Restricted/prohibited goods** | Per CA law (cannabis especially is its own licensed regime — do not carry without licensing). |
| 15 | **Fee schedule** | TBD — must satisfy Prop 22 earnings floor + SB 478 all-in disclosure, and fund the benefits pass-through (below). |

### Funding Prop 22 (California) `‹rider›`
Prop 22 is **cheap for this model**: high AOV + tiny geography keep engaged-time pay far above the ~120%-min-wage floor → the earnings-floor top-up ≈ $0 and engaged-mile reimbursement ≈ pennies. The only real recurring cost is a **healthcare stipend** (couriers averaging 15+ engaged hrs/wk, scaling at 25+) + **occupational-accident insurance** (per-courier policy).
- **Fund it consumer-side as a transparent dedicated *"Courier Benefits"* line the Platform takes $0 of** — a benefits *pool* that pays the stipend + insurance, reconciled quarterly.
- **Mechanism:** a small **flat-per-order** benefits fee (≈$0.50–1.00) *or* a **2–3% CA-only service-charge uplift** — prefer whichever reads cleaner under SB 478 (folding into the CA service-charge % is one fewer line item).
- **Never fund from the courier's cut** — self-defeating, and it poisons the trust core. The courier keeps 75% + 100% tips *and* gets the benefits.
- **Framing:** in a community neighborhood — post-fire Altadena especially — *"helps cover your courier's healthcare & injury coverage"* reads as **solidarity, not a junk fee.** The non-extractive model is what makes the transparent pass-through credible.

---

## Other jurisdictions — known mandates to plan for (city-level, apply where you operate)
- **Seattle:** App-Based Worker Minimum Payment Ordinance — greater of per-minute+per-mile or a per-offer minimum (annually adjusted).
- **New York City:** minimum pay rate for app-based restaurant delivery workers, **excluding tips** (annually adjusted).
- *General:* gig pay/benefit mandates apply where the work happens, not where the Platform is based.

*Authored 2026-06-20. The legal half of `INSTANCE`. Not legal advice.*
