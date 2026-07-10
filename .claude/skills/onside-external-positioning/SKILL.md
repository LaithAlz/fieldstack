---
name: onside-external-positioning
description: "What Onside may claim publicly and what must be proven first. Load before writing or editing ANY outward-facing claim: site copy, App Store listing text, press or social posts, README badges, investor or partner material, PR bodies that will be quoted publicly. Trigger phrasings: 'can we say X publicly', 'how many venues do we have', 'update the venue count', 'write the App Store description', 'is the every-field claim true', 'do we have live availability', 'compare us to CatchCorner', 'what attribution do we owe', 'are we allowed to use this data', 'OSM attribution', 'Google Places terms', 'privacy nutrition label', 'where does the 754 number come from', 'reproduce the published number'. Also the home of the external-obligations inventory (licences, attribution, Apple privacy manifest)."
---

# Onside external positioning: claims, evidence, obligations

This skill is the rulebook for every statement Onside makes to the outside world, and the inventory of legal and licence obligations that public-facing surfaces must discharge. The core discipline: a public number or claim is only as good as the command that regenerates it. If you cannot paste a command that proves a claim, label it a candidate claim or do not make it.

Product context in one line: Onside is a soccer-field discovery product for the Greater Toronto Area (GTA) with a live iOS app, a marketing site at getonside.ca, and a Supabase database populated by a scrape pipeline.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| House writing style, em-dash ban mechanics, doc templates, where docs live | onside-docs-and-writing |
| How the scrape pipeline works, adding a source, dedupe internals | onside-run-and-operate and venue-data-reference |
| Whether a change needs a PR, review gates, CI rules | onside-change-control |
| The launch campaign plan and its decision gates | onside-launch-campaign |
| Open problems (coverage completeness, availability inference) | onside-research-frontier |
| Env vars and secrets names | onside-config-and-flags |
| General system health measurement (API up, scrape logs, dedupe output) | onside-diagnostics-and-tooling |
| Recipes for measuring things from first principles | onside-proof-and-analysis-toolkit |

## Terms used here

- **Supabase**: hosted Postgres. Exposes a REST API (PostgREST) at `$SUPABASE_URL/rest/v1/`.
- **anon key**: the public Supabase API key. Row Level Security (RLS) restricts it to rows the public may see (active venues and fields). Counts taken with the anon key therefore equal what users can see, which makes them the publishable counts.
- **ODbL**: Open Database License, the OpenStreetMap licence. Requires visible attribution.
- **OGL / CC BY 4.0**: open-data licences used by Toronto (Open Government Licence, presumed) and Brampton (Creative Commons Attribution, confirmed). CC BY requires attribution.
- **Matchday**: the current design system (tokens in `design/tokens.json`).

## The positioning line and its evidence chain

The shipped positioning (verified in code as of 2026-07-06, HEAD `99a660d`):

- Site H1: "Every field in the GTA." / "Free parks included." (`site/app/page.tsx:45-47`)
- Site title: "Onside: Every soccer field in the GTA" (`site/app/layout.tsx:41`)
- Neutrality posture, footer legal: Onside is a field-discovery app; bookings are made directly with each field's operator (`site/components/footer.tsx`). No booking commission exists today.

**The one non-negotiable**: venue and field counts shown publicly must come from the live database at build or claim time. The site already does this: `site/app/page.tsx` computes `count = venues.length` from a build-time Supabase fetch, and the same live count feeds the stats band, the hero "N fields lit up tonight" panel (`site/components/night-map.tsx`), and the finder header. Never hardcode a count into copy, a README, a slide, or a post without date-stamping it and recording the regeneration command.

Known cap: the site's build-time query is `.limit(2000)` (`site/lib/venues.ts:139`). At 754 venues this is invisible; past 2000 active venues the site count silently saturates. Fix the limit before celebrating the milestone.

## Claims PROVEN (as of 2026-07-06)

Each row: the claim as you may phrase it publicly, plus its evidence.

| Claim | Evidence (live DB re-verified 2026-07-06, pre-scrape) |
|---|---|
| "754 venues mapped, including 435 free public parks" | Live DB count via anon key (recipes below). 754 active venues, 435 with `venue_type = public_park`, 1058 active fields |
| "Built from municipal open data (Toronto, Mississauga, Brampton), OpenStreetMap, and Google Places" | Per-source active venue counts: google 312, mississauga 140, toronto 135, brampton 91, osm 76. Those five sum to exactly 754; if they stop summing to the venue total, unprefixed (seed/manual) rows crept in. Adapters in `apps/api/scripts/scrape/run.ts` (ADAPTERS map, line 65) |
| "7 source adapters in the pipeline" | run.ts registers osm, manual, google, playtomic, mississauga, toronto, brampton. But only 5 contribute rows today (playtomic and manual are at 0). Public copy should say 5 sources or name them; reserve "7" for technical contexts that mention the two dormant adapters |
| "Player reviews on every venue page" (the capability) | Reviews system is live end to end: table `venue_reviews` (migration 005), app `ReviewSection`, report and block flows. Do NOT imply a populated review corpus: the live table held exactly 1 review on 2026-07-06 |
| "Light and dark themes" | Token pipeline `design/tokens.json` renders both palettes in app and site; site theme toggle in `site/components/theme-toggle.tsx` |
| "Prices on cards where operators publish them" | `site/lib/venues.ts` price states render "from $N/hr", a FREE chip, or "Rates on site"; app equivalent `fieldstack-app/src/lib/priceDisplay.ts` |
| "Free to browse, book direct with the operator" | Stats band `$0 free to browse & book direct` (`site/app/page.tsx:77`); redirect-only booking (feature flag `in_app_booking` defaults off) |
| "Live on the App Store" | `https://apps.apple.com/app/onside/id6780034337` (`site/components/app-store-button.tsx:2`) |

## Claims NOT yet provable: label as candidate or rephrase

| Tempting claim | Status | Approved phrasing |
|---|---|---|
| "Every field in the city" (literal completeness) | Unproven. Coverage completeness is an open frontier problem (see onside-research-frontier). The H1 is an established brand line; do not extend it into new factual assertions like "100% coverage" or "complete" | Keep the existing H1 as is; in factual contexts say "N venues mapped as of DATE, including free public parks" |
| "Live availability" | Does not exist. `docs/scraping.md` §3.3: live availability and price require operator credentials on every platform researched | "Jump straight to the operator's booking page" |
| "Real prices" at scale | Price coverage is thin: 2 of 1058 active fields have a numeric `price_per_hour`; 37 have a free-text `price_note` (live DB, 2026-07-06) | "Real prices where operators publish them" |
| "Accurate opening hours" / "open now" | Approximate. The Explore open-now filter evaluates a default 06:00-23:00 window for every venue because the search projection omits `hours` (issue #475, OPEN as of 2026-07-06). The venue-detail open line hides itself when data is missing rather than guessing | Do not market hours accuracy at all until #475 closes |
| "Honest reviews from players across the city" | The system is honest by design (reporting, blocking, anonymization on account deletion) but the corpus was 1 review on 2026-07-06 | Claim the capability, not the corpus |

## Competitive claims

The research of record is `docs/business-plan.md` (competitive landscape section, written 2026-06-24). It names CatchCorner (by Sports Illustrated, Canlan Sports deal) as the most direct competitor, a transactional marketplace for partner facilities only.

Rules:

- Every competitive claim carries a date: "CatchCorner listed no public parks as of 2026-06 research". Competitors change; undated claims rot into lies.
- Allowed frame (from the business plan): Onside competes on completeness (the long tail CatchCorner does not carry, public pitches, non-partner operators), reviews, player-first discovery, and SEO. Not on being first to hourly booking.
- Forbidden: absolutes about a competitor ("CatchCorner will never...", "the only app that..."), claims about their internals, or anything you have not personally re-verified against their current product.

## Reproducibility standard: number recipes

Any number published anywhere must ship with the command that regenerates it. All recipes below are read-only, use the anon key (RLS-limited to public rows), and run from `/Users/laith/code/soccer/site` where `.env.local` holds `SUPABASE_URL` and `SUPABASE_ANON_KEY`:

```bash
cd /Users/laith/code/soccer/site
set -a; source .env.local; set +a
count() {
  curl -s -o /dev/null -D - \
    -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Prefer: count=exact" -H "Range: 0-0" \
    "$SUPABASE_URL/rest/v1/$1" | grep -i content-range
}
count "venues?select=id&is_active=eq.true"                                # venues mapped
count "venues?select=id&is_active=eq.true&venue_type=eq.public_park"      # free parks
count "fields?select=id&is_active=eq.true"                                # fields
count "fields?select=id&is_active=eq.true&price_per_hour=not.is.null"     # numerically priced fields
count "venue_reviews?select=id"                                           # review corpus size
count "venues?select=id&is_active=eq.true&external_id=like.toronto:*"     # per-source (swap prefix)
```

Reference values on 2026-07-06 (pre-scrape): 754 / 435 / 1058 / 2 / 1. Per-source: google 312, mississauga 140, toronto 135, brampton 91, osm 76, playtomic 0, manual 0.

Timing trap: the scrape workflow cron is Monday 08:00 UTC (`.github/workflows/scrape.yml`). Counts can move every Monday. Always re-run the recipe on the day you publish, never quote last week's number.

Published page count (the live site, any machine):

```bash
curl -s https://getonside.ca/sitemap.xml | grep -c "<loc>"
```

Reference value 2026-07-06: 780 URLs = 754 venue pages + 21 city pages + 5 static (/, /venues, /support, /privacy, /terms). The live site's rendered count reflects the DB at its **last Vercel deploy**, not the DB right now. If the scrape ran since the last deploy, redeploy the site before quoting its on-page number.

## Obligations inventory

Duties Onside owes for the data it uses. "Verify" commands run from `/Users/laith/code/soccer`. Status is as of 2026-07-06.

| Obligation | Duty | Where discharged | Status |
|---|---|---|---|
| OSM attribution (ODbL) | Visible credit wherever OSM-derived data renders | App: pressable "© OpenStreetMap" chip on the Explore map linking to openstreetmap.org/copyright (`fieldstack-app/src/screens/main/ExploreScreen.tsx`, near line 606). Site: venue pages embed an openstreetmap.org iframe that carries OSM's own attribution inside it (`site/app/venues/[slug]/page.tsx`, near line 72) | DONE (app chip + embed's built-in credit) |
| Google Places: no content caching | Only the Place ID may be stored durably (`venues.google_place_id`, migration 024). Photos are stored as keyless short-lived lh3.googleusercontent URIs and fully re-resolved weekly (`apps/api/scripts/scrape/enrichPhotos.ts` header; `.github/workflows/scrape.yml` cron `0 8 * * 1`, enrichment step runs `if: always()` so a red scrape cannot skip it) | DONE, and load-bearing: if the weekly run stops, photos rot into broken images |
| Google Places: photo attribution display | `photo_attributions[i]` must render alongside `photos[i]` (index contract, migration 022) | App: credit overlay in `fieldstack-app/src/components/PhotoGallery.tsx`. Site: `<figcaption>` per photo in `site/app/venues/[slug]/page.tsx:173-175` | DONE |
| Google terms referenced in site legal pages | `docs/scraping.md` §4.4 says to publish Terms and Privacy referencing Google's | `site/app/terms/page.tsx` and `site/app/privacy/page.tsx` never mention Google Places (privacy names only Supabase, Sentry, PostHog) | **OPEN GAP** |
| Brampton open data (CC BY 4.0, confirmed) | Attribution required | No rendered "City of Brampton" credit exists anywhere in app or site (grep-verified) | **OPEN GAP** |
| Toronto open data (OGL-Toronto, presumed) | Licence presumed site-wide; the specific PFR Sport Field layer is not licence-stamped | Confirmation email to opendata@toronto.ca still outstanding (owner action; noted in `apps/api/scripts/scrape/sources/toronto.ts` header and `docs/scraping.md` §1.2). No rendered credit either | **OPEN: email + credit** |
| Playtomic internal API | Discovery-only, sparing use, clear User-Agent, never load-bearing booking (`docs/scraping.md` §4.4) | `apps/api/scripts/scrape/sources/playtomic.ts`; 0 GTA tenants is the expected steady state | DONE (posture honored) |

Quick drift checks:

```bash
# Attribution renders still exist?
grep -rn "openstreetmap.org/copyright" fieldstack-app/src/screens/main/ExploreScreen.tsx
grep -n "figcaption" "site/app/venues/[slug]/page.tsx"
# Brampton credit still missing? (empty output = gap still open)
grep -rn "City of Brampton" site fieldstack-app/src
# Weekly photo refresh still scheduled and unskippable?
grep -n "cron\|always()" .github/workflows/scrape.yml
```

An honest external answer to "do you comply with your data licences" is therefore: OSM and Google yes; Brampton and Toronto attribution are known open items. Do not claim full compliance until both gaps close (each is a one-line footer credit plus, for Toronto, the confirmation email).

## Privacy posture (Apple manifest + analytics)

Facts to keep the App Store privacy questionnaire, the app manifest, and public privacy statements in sync (all in `fieldstack-app/app.json`, `NSPrivacyTracking: false`):

- Collected data types declared (all Tracking: false): EmailAddress (linked), UserID (linked), PreciseLocation (not linked), CrashData, PerformanceData, ProductInteraction (not linked), **OtherUsageData (linked: booking history + recently viewed venues)**, **OtherUserContent (linked: saved venues + preferred play slot)**. The last two were added 2026-07-05 (commit `02f5613`) and the matching App Store Connect labels are NOT yet updated (see resubmission list below).
- PostHog receives the user id only. The identify call deliberately sends no email or contact traits (commit `02f5613` removed the email trait; comment in `fieldstack-app/src/lib/auth.tsx` near line 165). `reset()` fires on sign-out. Never re-add traits without redoing the privacy labels.
- Site analytics is Vercel Analytics; the site privacy page names Supabase, Sentry, PostHog as processors.

## App Store listing facts (as of 2026-07-05)

- Live listing: id `6780034337`, bundle `app.onside.mobile`. The **live binary predates the Matchday redesign** (the sheet-over-map Explore rebuild and token system shipped 2026-07-05; no build was submitted after them as of that date).
- The pending resubmission needs, per `docs/app-store-checklist.md` §8: fresh 6.9 inch screenshots of the Matchday UI (the section 3 shot list predates the rebuild; use `.maestro/screenshots.yaml`, requires a dev build), the privacy-label update in App Store Connect matching the two new manifest rows, and a new EAS build + submit (privacy manifest is a native change, not OTA-able).
- Stale public assets: `site/public/screens/01-explore.png` through `04-profile.png` were last committed 2026-06-15, pre-Matchday, and still render in the homepage "A look inside" strip. Anyone quoting or screenshotting the site should know these do not show the current app.

## Rules when writing new public copy

1. No em dashes in any user-facing copy (repo-wide rule; mechanics and substitutes in onside-docs-and-writing). Hyphens and worded ranges ("5-a-side to 11-a-side") are fine.
2. Counts come from the live DB at build or claim time. Date-stamp any count that leaves the site's auto-updating surfaces.
3. Every number you publish gets its regeneration command recorded next to wherever the number lives (PR body, doc, campaign sheet).
4. Competitive claims are dated and re-verified at publish time.
5. Price language: "from $N/hr" is a floor, never a quote. Free is only claimable for explicit $0 fields or public parks (the `isFreeVenue` rule).
6. Nothing here overrides change control: copy changes ship as a PR per issue with green CI like everything else (onside-change-control).

## Provenance and maintenance

All facts above verified against repo HEAD `99a660d` (post PR #488) and the live Supabase DB, most recently 2026-07-06 (pre-scrape; the Monday cron had not yet run). Re-verify before relying on:

| Fact | Re-verify with (run from /Users/laith/code/soccer unless noted) |
|---|---|
| Venue/park/field/priced/review counts | The `count()` recipes above (run from `site/`) |
| Per-source contribution | The `external_id=like.<prefix>:*` recipe per source |
| Adapter list (currently 7) | `grep -n "Adapter.source" apps/api/scripts/scrape/run.ts` |
| H1 and title strings | `grep -n "Every field in the GTA" site/app/page.tsx; grep -n "title:" site/app/layout.tsx` |
| Site count cap (2000) | `grep -n "limit(2000)" site/lib/venues.ts` |
| Issue #475 still open | `gh issue view 475 --json state,title` |
| Brampton/Toronto attribution gaps | `grep -rn "City of Brampton\|City of Toronto" site fieldstack-app/src` (empty = still open) |
| Legal pages still silent on Google | `grep -in google site/app/terms/page.tsx site/app/privacy/page.tsx` |
| Weekly photo refresh | `grep -n "cron" .github/workflows/scrape.yml` |
| PostHog identify sends id only | `grep -n "identify(" fieldstack-app/src/lib/auth.tsx` |
| Privacy manifest rows | `grep -n "NSPrivacyCollectedDataType\"" fieldstack-app/app.json` |
| Live binary vs redesign | `docs/app-store-checklist.md` §8 checkboxes; App Store listing screenshots |
| Live sitemap size | `curl -s https://getonside.ca/sitemap.xml | grep -c "<loc>"` |
