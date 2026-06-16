# Onside — Business Plan & Strategy

*Market, competition, model, roadmap, projections, funding, and exit paths.*
Figures are illustrative planning estimates with stated assumptions, not
guarantees. All external facts are cited in [Sources](#sources).

---

## 1. Executive summary

Onside is a **soccer-field discovery app** for the Greater Toronto Area (GTA).
Today it's a directory: it has the cleanest list of every venue in the region
(~125 confirmed bookable facilities + public pitches), shows them on a map with
details and reviews, and links players out to each operator's own booking page.

**The opportunity:** field time is fragmented, hard to find, and operators have
empty off-peak hours they can't fill. Nobody owns "where do I play soccer in
Toronto." Onside can — by aggregating demand first (app + search), then becoming
the booking layer operators pay to access that demand.

**The honest framing:** this is **not** an obvious billion-dollar venture. It is
a realistic path to either (a) a profitable, capital-efficient SMB/marketplace
business, or (b) a strategic tuck-in acquisition by a sports-facility software or
sports-marketplace company. Both are achievable; both are de-risked by a direct
precedent (**Pitchbooking**, below) that reached £25M+ in annual bookings on
under £1M raised.

**Tailwind:** the **2026 FIFA World Cup is being co-hosted in Toronto**, driving
a measurable soccer-participation boom — and public commentary already flags
*field availability* as a bottleneck. Onside sits exactly on that pain. ([Goal.com](https://www.goal.com/en-ca/lists/canada-world-cup-soccer-boom-fields-coaches-funding-concerns/blt6e729e4f4fef29af))

---

## 2. The market

**Top-down.** The global sports-management software market is ~**$10.2B in 2025**,
growing to ~**$17.5B by 2030** (~11.5% CAGR). Onside touches the
facility-booking + discovery slice of this. ([market data](https://www.mindbodyonline.com/business/education/comparison/10-best-sports-facility-software-options))

**Bottom-up (the slice that matters).**
- **Ontario has ~309,000 registered soccer players**, mostly youth — the largest
  participation sport in the province (more than hockey's ~206k). ([Goal.com](https://www.goal.com/en-ca/lists/canada-world-cup-soccer-boom-fields-coaches-funding-concerns/blt6e729e4f4fef29af))
- The GTA has on the order of **100+ bookable soccer facilities** (Onside has
  ~125 in-database today after cleanup), plus hundreds of public pitches.
- Indoor field time rents at roughly **$150–$300/hour**; a dome runs ~16
  bookable hours/day. Even modest capture of this flow is meaningful GMV (Gross
  Merchandise Value — total booking dollars flowing through the platform).

**Why now:** World Cup 2026 in Toronto + a structural shortage of field hours =
rising demand against constrained supply. Discovery and off-peak optimization
both get more valuable in that environment.

---

## 3. Competitive landscape

There is no dominant "soccer field discovery + booking" player in Canada. The
field splits into four camps:

### 3a. Booking *marketplaces* (own the transaction — the model to grow into)

| Company | What they do | Scale / funding | Relevance |
|---|---|---|---|
| **Playtomic** (Spain) | Racket-sports (padel/tennis) court booking marketplace | **$273M valuation** (Mar 2025), ~$153M raised, 6,000 clubs / 63 countries / 1.5M MAU, €240M bookings in 2024; expanding to US/UK/Germany | Proof the consumer booking-marketplace model scales massively — but in racket sports, not soccer. Could enter soccer/North America (both a threat and a potential acquirer). ([US News](https://www.usnews.com/news/technology/articles/2025-03-19/spanish-startup-playtomic-valued-at-273-million-in-new-funding-round)) |
| **Pitchbooking** (Belfast) | Booking + management for sports **pitches** (the direct analog) | Founded 2018, **~£800K total raised**, **£25M+ bookings/year**, clients incl. Irish FA, Nottingham Forest & West Ham foundations | The closest precedent to Onside's end-state, and proof it's doable **capital-efficiently**. Focused on UK/Ireland — not Canada. ([Silicon Republic](https://www.siliconrepublic.com/start-ups/belfast-sports-tech-start-up-pitchbooking-secures-550000)) |

### 3b. Pickup-game organizers (adjacent — overlapping users, different job)

| Company | What they do | Relevance |
|---|---|---|
| **OpenSports** (Toronto) | Organize/host pickup & drop-in games; takes ~5% of organizer revenue | Local, same users, but solves *"join a game,"* not *"find & book a field."* Complementary — potential partner or competitor if they move into discovery. ([Inc.](https://www.inc.com/magazine/201905/michelle-cheng/opensports-pickup-sports-games-league-app.html)) |
| **GoodRec** | Pickup sports at partner facilities | Same adjacency; demand-side aggregator for pickup. |

### 3c. Facility-management SaaS (sell *to operators* — partners & acquirers)

These power the operators' own booking systems. Onside integrates with or sits
on top of them; several are realistic acquirers (Section 9).

- **Amilia** (Montreal) — recreation/facility management + payments; **$35M raised** May 2025, 1,500 orgs / 6,600 facilities, **~$1B transactions/yr**, +130% revenue since 2022. ([Fintech.ca](https://www.fintech.ca/2025/05/08/montreal-amilia-raises-scale-recreation-fintech-platform/))
- **EZFacility** (owned by **Jonas Software**), **CourtReserve**, **Skedda**, **Upper Hand**, **Daxko**, **LeagueApps** (acquired **RecTimes**, a facility-booking tool, May 2025).

### 3d. Onside today (demand-side discovery)

A clean directory + map + reviews that links out. **No competitor owns GTA
soccer discovery.** That's the open lane.

### Positioning

```
                 OWNS THE TRANSACTION
                          ▲
                          │   Playtomic (racket)
        Pitchbooking ●    │   ● Amilia / CourtReserve (operator SaaS)
        (pitches)         │
   SUPPLY-SIDE ───────────┼─────────────── DEMAND-SIDE
   (sell to operators)    │              (own the player)
                          │   ● OpenSports / GoodRec (pickup)
                          │   ★ ONSIDE today (discovery, links out)
                          │   ⤷ Onside target: move UP (own booking)
                          ▼
                  JUST LISTS / REFERS
```

**Onside's wedge:** start bottom-right (own demand cheaply via app + SEO), then
move up into the transaction — the quadrant nobody occupies in Canadian soccer.

---

## 4. Positioning & moat

The listings are **not** the moat (anyone can scrape Google — we did). The moat
is built in this order:

1. **Demand aggregation + brand** — be the default answer to "play soccer in
   Toronto" (app installs + #1 search results for "indoor soccer <city>").
2. **Proprietary intent data** — every "Book on operator's site" click is
   captured (already instrumented). This is the unique dataset operators can't
   get elsewhere and the wedge to sign them.
3. **Two-sided liquidity** — once players *and* operators are on-platform, each
   side reinforces the other; that flywheel is hard to copy.
4. **Availability data** — real-time field availability that operators don't
   expose anywhere else becomes the defensible layer.

---

## 5. Business model

Three stacked revenue streams, introduced in sequence (not all at once):

| # | Stream | How it works | Typical economics |
|---|---|---|---|
| 1 | **Lead-gen / featured listings** (now → near-term) | Operators pay for placement or per qualified referral | Low $ per lead; bridge revenue + sales proof |
| 2 | **Transactional commission** (the core) | Player books field time in-app; Onside takes a cut | **8–15%** of booking is the industry norm; model uses **12%** ([benchmark](https://www.lowcode.agency/blog/how-to-build-a-sports-facility-marketplace)) |
| 3 | **Operator SaaS / subscription** | Monthly fee for the booking widget, dashboard, off-peak tools | Adds predictable MRR; **hybrid commission + SaaS outperforms pure commission at scale** ([benchmark](https://www.dittofi.com/learn/the-top-marketplace-business-models)) |

**The killer feature for operators: off-peak fill.** Domes sit empty mid-day and
late-night. Onside's demand can be pointed (via dynamic pricing/promotion) at
exactly those dead hours — incremental revenue the operator wouldn't otherwise
get, which makes a 12% take easy to justify.

### Unit economics (per booked hour, base assumptions)

```
  Avg indoor field booking (1 hr)      $180
  Onside take rate                       12%
  ─────────────────────────────────────────
  Net revenue per booking             ~$21.60
  + payment processing passed through    (to operator/player)
```

A single active operator doing ~120 Onside-driven bookings/month ≈ **$2,600/mo
net** to Onside. Twenty such operators ≈ **$620K/yr** net. That's the shape of
the business.

---

## 6. Roadmap

```
 PHASE 1  ── Demand engine ─────────────────────  (0–3 months)   [IN PROGRESS]
   • App live on App Store
   • 207 SEO venue pages + sitemap  ✓ built
   • Book-click intent tracking     ✓ built
   • SEO content for "indoor soccer <city>"

 PHASE 2  ── Operator funnel ───────────────────  (3–9 months)
   • "Claim your venue" flow (turn the 125 facilities into leads)
   • Operator dashboard (edit hours/prices/photos)  ← first SaaS hook
   • Sign 5–10 anchor operators using the click data
   • Real-time availability for 2–3 of them

 PHASE 3  ── Transactional booking ─────────────  (9–18 months)
   • In-app booking + payments on anchor operators
   • 12% commission live; SaaS tier launched
   • Dynamic off-peak pricing tools

 PHASE 4  ── Scale & expand ────────────────────  (18–36 months)
   • 80–120 operators in the GTA
   • City #2 (Ottawa / Montreal / Vancouver) — config-driven, low cost
   • Adjacent sports (futsal → basketball → cricket; data already shows demand)
```

Everything is built city-agnostic (cities live in a config file), so Phase 4
geographic expansion is cheap to start.

---

## 7. Financial projections (illustrative)

**Assumptions:** $180 avg booking, 12% take, operators ramp to ~120
Onside-bookings/month at maturity, SaaS at ~$59/mo per paying operator. Numbers
are conservative for a new marketplace and meant to show *shape*, not promise.

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Live operators (year-end) | 8 | 35 | 90 |
| Avg active operators (year) | 4 | 22 | 65 |
| Onside bookings / operator / mo | 25 | 60 | 100 |
| **Bookings / year** | ~1,200 | ~15,800 | ~78,000 |
| **GMV** (booking dollars) | ~$216K | ~$2.8M | ~$14.0M |
| Commission @ 12% | ~$26K | ~$340K | ~$1.68M |
| SaaS / featured revenue | ~$10K | ~$70K | ~$190K |
| **Net revenue** | **~$36K** | **~$410K** | **~$1.87M** |

- **Year 1** is intentionally demand-building: most value is the install base +
  intent data + first paid operators, not transaction volume.
- **Year 2** is the inflection: transactional booking goes live and operators
  compound.
- **Year 3** assumes GTA depth + the start of city #2.

A **lean / bootstrapped** version (slower operator ramp, no city #2) still
reaches ~$150–250K net by Year 3 — a viable owner-operated business. An
**accelerated** version (funded, faster operator GTM + 2 extra cities) could
roughly double the Year-3 figure.

---

## 8. Investment / funding strategy

**You may not need to raise.** Pitchbooking reached £25M+ annual bookings on
<£1M total — the niche rewards capital efficiency. Onside's costs today are
near-zero (Vercel/Fly/Supabase free-to-cheap tiers; the Google scraper is
coffee-money). A bootstrap path is real.

**If you want to accelerate**, the right raise is a small **pre-seed of
~$300K–$750K CAD** for an ~18-month runway, spent on:
- 1 full-stack hire for the operator-integration build (the hard, defensible
  part), and
- 1 part-time GTM/operator-sales person to land the first 20 operators.

**Non-dilutive Canadian options to stack first:** BDC / Futurpreneur loans,
FedDev Ontario, SR&ED tax credits, MaRS / OCI programs — common for Ontario
sports-tech and cheaper than equity at this stage.

**Reality check:** at pre-seed, traction = installs + book-click volume +
signed operators. Build those (Phase 1–2) *before* raising; they're also exactly
what an acquirer wants to see.

---

## 9. Acquisition landscape (realistic only)

Sports-tech M&A is active and rising — **44 deals YTD 2024 → 65 YTD 2025**. The
relevant pattern: facility-software and sports-marketplace companies buy
demand-side and booking tools as tuck-ins. ([Capstone Partners](https://www.capstonepartners.com/insights/article-sports-technology-ma-update/))

**Most realistic acquirers (and why):**

| Acquirer | Why they'd buy Onside |
|---|---|
| **Amilia** (Montreal) | Sells facility/rec SaaS to exactly these operators, just raised $35M, growing 130%. A GTA demand-side app + clean venue data is a natural complement and a Canadian, in-region fit. |
| **Jonas Software** (Toronto-area) | Bought **29** software companies in 2024; owns EZFacility (sports-facility mgmt). Classic buy-and-hold acquirer of profitable vertical SaaS — a likely home if Onside reaches steady revenue. |
| **LeagueApps** | Already acquired **RecTimes** (facility booking) in 2025 — directly in-market for this. |
| **Daxko** | Serial acquirer across fitness/rec software (ShapeNet, Exercise.com, Motionsoft, Vision). |
| **Playtomic** | If/when it expands beyond racket sports into North American soccer, Onside is a ready-made GTA beachhead + brand. |

**Comparable deal signal:** **LeagueApps → RecTimes (2025)** is the cleanest
comp — a facility-booking tool acquired by a sports platform. Pitchbooking
(unacquired, £25M bookings) sets a reference for what scale looks like in the
niche.

**Honest valuation framing:** a realistic exit here is a **strategic tuck-in in
the single-digit to low-tens-of-millions** range *once there's revenue and
liquidity* — driven by Onside's demand base, brand, and operator relationships,
not a venture mega-exit. The capital-efficient path means even a modest exit can
be a strong outcome for a small cap table.

---

## 10. Key risks

- **Operator integration is the whole game** — it's the hard part *and* the moat.
  Underbuild it and Onside stays a directory; nail it and it's a marketplace.
- **A directory that only links out is a feature, not a company.** Value capture
  requires owning the transaction or the operator relationship.
- **GTA-only TAM is limited** — the model must be replicable by city/sport
  (it's architected to be).
- **Chicken-and-egg** — solved supply-first (we already have the venues) and
  demand-first (app + SEO); transactions come after both sides show up.
- **Bigger players entering** (Playtomic in soccer/NA, or a SaaS adding
  discovery) — mitigated by moving fast on demand + brand now, while the lane is
  open.

---

## Sources

- Playtomic valuation/funding — [US News](https://www.usnews.com/news/technology/articles/2025-03-19/spanish-startup-playtomic-valued-at-273-million-in-new-funding-round), [Invezz](https://invezz.com/news/2025/03/19/spanish-startup-playtomic-aces-funding-round-reaching-273m-valuation/)
- Pitchbooking funding/scale — [Silicon Republic](https://www.siliconrepublic.com/start-ups/belfast-sports-tech-start-up-pitchbooking-secures-550000), [Silicon Republic (£250K)](https://www.siliconrepublic.com/start-ups/pitchbooking-funding)
- OpenSports model — [Inc.](https://www.inc.com/magazine/201905/michelle-cheng/opensports-pickup-sports-games-league-app.html)
- Amilia funding/scale — [Fintech.ca](https://www.fintech.ca/2025/05/08/montreal-amilia-raises-scale-recreation-fintech-platform/), [Startup Ecosystem Canada](https://www.startupecosystem.ca/news/amilia-raises-35-million-to-expand-recreation-management-software/)
- Sports-tech M&A volume & LeagueApps/RecTimes — [Capstone Partners](https://www.capstonepartners.com/insights/article-sports-technology-ma-update/)
- Daxko acquisitions — [Athletech News](https://athletechnews.com/daxko-acquires-exercise-com-boutique-fitness-tech/)
- Jonas Software 2024 acquisitions — [Jonas Software](https://jonassoftware.com/2025-year-in-review)
- Sports-management software market size — [Mindbody](https://www.mindbodyonline.com/business/education/comparison/10-best-sports-facility-software-options)
- Ontario soccer participation + World Cup field-shortage tailwind — [Goal.com](https://www.goal.com/en-ca/lists/canada-world-cup-soccer-boom-fields-coaches-funding-concerns/blt6e729e4f4fef29af)
- Marketplace take-rate & off-peak benchmarks — [Lowcode](https://www.lowcode.agency/blog/how-to-build-a-sports-facility-marketplace), [Dittofi](https://www.dittofi.com/learn/the-top-marketplace-business-models)
