---
name: onside-docs-and-writing
description: >
  Docs of record and house writing style for the Onside repo (GTA soccer-field
  discovery: Expo app, Fastify API, scrape pipeline, Next.js site). Load this when
  you are about to: edit anything under docs/, write or change user-facing copy
  (app strings, site copy, App Store listing text, OG descriptions), write a commit
  message, PR body, or issue body, add a code comment, decide where a new piece of
  knowledge should live (which doc or which skill), or reconcile a doc that
  contradicts the code. Trigger phrasings: "update the docs", "which doc covers X",
  "write the PR body", "file an issue for this", "is this doc stale", "the doc says
  X but the code does Y", "add a comment explaining this", "write copy for", "can I
  use an em dash", "what is the tagline", "where should I document this decision".
---

# Onside docs and writing

House rules for every word written in this repo: documentation, product copy, commit
messages, PR bodies, issues, and code comments. Repo: `/Users/laith/code/soccer`
(GitHub `LaithAlz/fieldstack`). All file:line references verified at HEAD `99a660d`
(as of 2026-07-05); line numbers drift, so when one looks stale, grep for the quoted
phrase instead.

Jargon used once, defined once:
- **Doc of record**: the single file that owns a topic. Other docs and skills cite it
  instead of restating it.
- **Matchday**: the current design system (tokens in `design/tokens.json`, name appears
  in `docs/app-store-checklist.md:1` and `site/README.md:16`). Its predecessor theme
  was called "Night Kickoff"; that name survives only in one code comment.
- **OTA**: over-the-air JS update via `eas update`, no App Store review.
- **pSEO**: programmatic SEO, the generated `/soccer-fields/[city]` pages on the site.
- **ASC**: App Store Connect, Apple's app-submission dashboard.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| How a change is gated, branched, merged (PR per issue, CI green, merge commits) | `onside-change-control` |
| The full story of a past incident | `onside-failure-archaeology` |
| Why an architectural decision was made | `onside-architecture-contract` and `docs/architecture.md` |
| Env vars, secrets, feature flags | `onside-config-and-flags` |
| Running the scraper, deploying, releasing the app | `onside-run-and-operate` |
| What Onside may claim publicly, licence/attribution duties | `onside-external-positioning` |

## 1. Docs of record map (as of 2026-07-05)

All under `/Users/laith/code/soccer` unless noted. "Authority" says how much to trust
it when it disagrees with code: AUTHORITATIVE docs are kept current on purpose and a
mismatch usually means the doc must be updated in the same PR; ADVISORY docs describe
intent at time of writing and code wins.

| File | Lines | Doc of record for | Authority |
|---|---|---|---|
| `docs/scraping.md` | 456 | Scrape pipeline, source ranking, Google/OSM/municipal ToS rules, booking-integration strategy, §5 build order | AUTHORITATIVE for pipeline rules and ToS. §0 and §1.2 are the current-state sections; the header blockquote (lines 7-11) is stale, see section 6 |
| `docs/architecture.md` | 540 | System overview + decision log D1 to D14 with alternatives and tradeoffs, glossary | AUTHORITATIVE for decisions; written plain-English for zero-context readers |
| `docs/analytics.md` | 99 | PostHog event names, dashboard build recipes, segments | ADVISORY, known stale (see section 6) |
| `docs/app-store-checklist.md` | 190 | ASC submission process; §8 scopes the current Matchday resubmission | AUTHORITATIVE for §8; §2 example copy predates the Onside rebrand (see section 6) |
| `docs/business-plan.md` | 313 | Market, competition, model, roadmap; self-labels its figures "illustrative planning estimates" (lines 3-5) | ADVISORY by design |
| `docs/deploy-backend.md` | 103 | Fly.io API deployment runbook, `api.getonside.ca` domain | AUTHORITATIVE |
| `docs/releasing.md` | 97 | Release mechanics: remote `appVersionSource` (never hand-edit buildNumber), OTA vs native build, the never-OTA-production-while-In-Review rule (lines 72-86) | AUTHORITATIVE |
| `site/README.md` | 52 | Site structure, Vercel deploy settings, support email forwarding | ADVISORY, one garbled stale claim (see section 6) |
| `.maestro/README.md` | | Maestro screenshot/smoke flows | AUTHORITATIVE for how to run them |
| `fieldstack-app/docs/{fieldstack-issues.md, standards.md}` | | May-era planning artifacts (component build order, REQ-F0.x standards) | HISTORICAL. Do not update; do not treat as current process |
| `.claude/skills/onside-*` | | The operational knowledge library (this skill and its siblings) | AUTHORITATIVE; each skill ends with a Provenance section |
| `AGENTS.md` (root) | | Entry point for non-Claude agents (Codex CLI): skill routing table + one-line hard-rule digests, each citing its home. `.agents/skills` is a symlink to `.claude/skills`, so both harnesses read one library | AUTHORITATIVE as a pointer file; if it disagrees with a skill, the skill wins and AGENTS.md gets fixed in the same PR |

Rule: one home per fact. If two docs state the same fact, one of them must become a
pointer to the other in your PR.

## 2. User-facing copy rules

"User-facing" means: app strings, site copy, App Store listing text, OG/social
descriptions, notification text, error toasts. NOT internal docs/ prose and NOT code
comments (both use em dashes freely today; leave them be).

### 2.1 No em dashes, limited en dashes

- **Never an em dash** in user-facing copy. Established by PR #401 (merge `e52c625`,
  PR body's reasoning: em dashes read as an AI tell) and re-swept by PRs #481/#482
  during the Matchday redesign. Replace with a comma, period, colon, parentheses, or
  a rewrite. Examples that shipped:
  - Title became `"Onside: Every soccer field in the GTA"` (`site/app/layout.tsx`).
  - `"Thanks, we'll review it."` and `"What was the field like? (optional)"`
    (`fieldstack-app/src/components/ReviewSection.tsx`).
- **En dashes only for tight numeric ranges**, written as the `&ndash;` entity in JSX:
  the one live example is `1&ndash;2 business days` (`site/app/support/page.tsx:83`).
  When in doubt, use the word "to" instead.
- **Ranges in prose use words**: "size from 5-a-side to 11-a-side"
  (`site/app/page.tsx`), prices as "$80 to $120", never "$80-$120".
- **Time ranges use the word "to"**: `formatTime12h(start) + " to " + end`, e.g.
  "7:00 PM to 8:30 PM" (`fieldstack-app/src/lib/datetime.ts:61`).
- **Middot separators are the house join character**: "Free · iPhone · No account
  needed to browse" (`site/app/page.tsx`), "date · time to time" (`datetime.ts:61`).
- This skill library itself bans em AND en dashes entirely (stricter than product
  copy); paraphrase quotes that contain them.

Check before shipping copy (run from repo root; `\xe2\x80\x94` is the UTF-8 em dash,
spelled as bytes so this file stays dash-free). The unfiltered grep returns hundreds
of hits because code comments legitimately use em dashes; the pipeline below strips
obvious comment lines. As of 2026-07-05 every surviving hit is a JSX comment or a
test name, zero are user-visible strings; keep it that way:

```sh
grep -rn $'\xe2\x80\x94' fieldstack-app/src site/app site/components \
  --include='*.tsx' --include='*.ts' | grep -v '//' | grep -v '^\s*\*' | grep -v '\* '
```

### 2.2 Fixed phrases, verbatim

| Phrase | Where it lives | Rule |
|---|---|---|
| "Every field in the GTA." + "Free parks included." | site hero H1, `site/app/page.tsx:45-47`; the second line also appears on city pages that have free venues (`site/app/soccer-fields/[city]/page.tsx:132`) | The positioning line. Reuse verbatim, including the periods; do not restyle |
| "Onside: Every soccer field in the GTA" | `<title>`, `site/app/layout.tsx` | Colon, not a dash |
| "Every field in the GTA on one map: turf, indoor, outdoor." | meta description `layout.tsx:58`, OG image `opengraph-image.tsx:110` | Keep in sync across both |
| "New" | `fieldstack-app/src/components/ReviewSection.tsx:148` | The no-reviews placeholder is the single word New, not a dash, not "N/A", not "0.0" |
| "No reviews yet. Be the first to share a take." | `ReviewSection.tsx:240` | Empty-state voice: short, invitational |
| "Onside is a field-discovery app; bookings are made directly with each field's operator" | `site/components/footer.tsx` | The neutrality posture. Any copy about booking must keep this frame: Onside hands off, operators take the booking |
| "This pitch doesn't exist." | `site/app/not-found.tsx` | 404 voice reference point: on-brand, dry, short |

Copy voice in one line: short declarative sentences, soccer-literate but plain, prices
and counts always honest (FREE is a win, not a missing price; see the FreeBadge
comment in `fieldstack-app/src/components/FreeBadge.tsx`).

### 2.3 Numbers in copy

Never hardcode venue/city counts in site or app copy. The site computes every count at
build time from Supabase (`site/lib/venues.ts`, hero `venues.length`, night-map "N
fields lit up tonight"). A hardcoded count is stale by the next weekly scrape.

## 3. Code comment style

The repo pattern: **a comment states a constraint the code cannot show, and acts as
the tripwire for a rule settled by an incident.** Never narration ("loop over the
venues"), never PR-review self-justification ("refactored for clarity").

Gold-standard examples to imitate:
- `fieldstack-app/src/screens/main/ExploreScreen.tsx:102-111`: why
  `tracksViewChanges` is permanently true and what happened when it was flipped or
  false (crash and frozen-pin history compressed into ten lines, with the verified
  outcome stated).
- `fieldstack-app/src/lib/priceDisplay.ts:1-9`: why the module exists (the "$0/hr"
  bug) and the invariant it enforces (every render site routes through one function).
- `fieldstack-app/src/lib/analytics.ts:21-30`: each event constant carries a one-line
  comment saying which feature and PR motivated it and what it measures.

If your fix leaves a rule future sessions must obey, the comment goes NEXT TO the
danger in code, and the story goes in `onside-failure-archaeology` (its "How to add
an entry" section is the template). The comment cites the mechanism, not the PR
number alone.

Known cosmetic drift you may fix in passing but never silently propagate: the theme
comment at `fieldstack-app/src/theme/tokens.ts:39` still calls the type system
"Night Kickoff"; the system has been Matchday since PR #471 (2026-07-05).

## 4. Commit, PR, and issue writing

Process gates (branch per issue, CI green, `gh pr merge --merge`, never squash) are
owned by `onside-change-control`. This section owns only the WORDS.

### 4.1 Commit subjects

Observed house style (verify: `git log --format='%s' --no-merges -15`):
- Short, plain, specific: "Fix map pin rendering found in on-device verification",
  "Drop the eyebrow dash bar", "Site restyled on shared Matchday tokens".
- Batches use a colon summary: "Matchday review fixes: booking sync, FREE rollup,
  theme flash, site parity, site CI".
- **No trailers, no attribution footers.** Exactly 11 `Co-Authored-By` trailers exist
  in history, all dated 2026-05-10 before the convention settled; zero in the roughly
  600 commits since. Do not add attribution trailers to commits or "generated by
  Claude" footers to PR bodies.

### 4.2 PR bodies

The de facto template (this is the real shape of merged PR #488, abridged):

```
Closes #<issue>

<one paragraph, or one paragraph per surface, explaining WHAT changed and WHY.
Group by surface when the PR touches more than one: **Site**: ... **App**: ...>

Verified: <the evidence: builds clean, N tests green, on-device/simulator check,
generator idempotent, whatever proves it. Concrete, not "tested locally".>
```

Rules: `Closes #N` is the first line (auto-closes the issue on merge). The body
explains intent and mechanism, not a file-by-file diff recap. The `Verified:`
paragraph is not optional; state what you actually ran.

### 4.3 Issue bodies

Two shapes in use:

**Bug** (real example, issue #454): title is the symptom
("Photo gallery crashes on swipe (mixed animation drivers in Dots)"), body is
mechanism + why it was latent + fix direction, a few sentences, no headings:

```
<mechanism: what does what to what>. <why it only surfaces now / trigger
condition>. Fix: <direction>.
```

**Work batch** (real example, issue #487): title lists the deliverables, body is a
comma-run of the concrete items, each specific enough to verify done.

One issue per coherent change; the PR that fixes it says `Closes #N`.

## 5. Templates

### 5.1 Incident entry

Owned by `onside-failure-archaeology`, section "How to add an entry". Do not
duplicate its format here; the four fields are Symptom, Root cause, Evidence
(merged commit hashes), Status.

### 5.2 Skill maintenance entry (this library)

When you change a sibling skill or add a drift-prone fact to one, append a row to
that skill's closing "Provenance and maintenance" table:

```
| <the claim that can drift> | `<one copy-pasteable command that re-verifies it>` |
```

Every skill in the library ends with that section; keep facts date-stamped
"(as of YYYY-MM-DD)" when they are volatile (counts, live-service states, endpoint
behavior).

### 5.3 New doc-of-record checklist

Before adding a file to `docs/`:
- [ ] Confirm no existing doc owns the topic (section 1 table); extend before creating.
- [ ] State in the first paragraph what the doc is the record FOR.
- [ ] If it contains volatile numbers, date-stamp them.
- [ ] Add the doc to this skill's section 1 table in the same PR.

## 6. Doc maintenance rules, with the repo's own failures as evidence

**Rule 1: a doc must never keep claiming something is unshipped, manual, or named X
after the code ships, automates, or renames it.** Every one of these is a live,
verified example of the failure mode (as of 2026-07-05), and doubles as your fix
list when touching that doc:

| Stale claim | Reality | Fix when touching |
|---|---|---|
| `docs/scraping.md:7-11` header blockquote: strategy-only, stub with TODOs, no live API calls wired | `playtomic.ts`, `toronto.ts`, `brampton.ts`, `googlePlaces.ts` are live and registered; §1.2's own heading says "shipped for Toronto + Brampton" | Rewrite the blockquote to describe current state; §0/§1.2 win over the header |
| `docs/scraping.md:33`: "Today it is run by hand." | `.github/workflows/scrape.yml` schedules it weekly, cron `0 8 * * 1`, since the doc's own §4.1 shipped | Delete the sentence, point to the workflow |
| `docs/analytics.md:31-33`: screen values `VenueList`, `MapView`, `FieldSearch` | The Explore rebuild (PR #474) collapsed them into one `Explore` route (`fieldstack-app/src/navigation/MainNavigator.tsx`); dashboards spanning the rebuild see both old and new names | Update the list; note the rename date for dashboard readers |
| `docs/analytics.md:87`: segment on "identified `email` property (set at `identify`)" | PR #488 removed email from identify on purpose (`fieldstack-app/src/lib/auth.tsx:165`, keeps privacy-label answers small) | Replace with a cohort that does not rely on identify traits |
| `docs/analytics.md` event table: missing `review_prompt_shown/accepted`, `explore_chip_toggled`, `explore_sheet_snapped`, `booking_request_submitted` | All exported in `fieldstack-app/src/lib/analytics.ts:22-29` | Add rows |
| `site/README.md:36-38`: says the OG image imports `../../design/tokens.json`; the sentence is also textually garbled | Code imports `site/lib/tokens.generated.json` (`site/app/opengraph-image.tsx:3`), generated by `design/generate.mjs` exactly so the site never reaches outside Vercel's root | Rewrite the bullet |
| `docs/app-store-checklist.md:56-63`: example name "FieldStack: GTA Soccer Fields", URL `fieldstack.app/support` | Rebrand to Onside shipped 2026-05 (PR #161); real support URL is `getonside.ca/support`; §8 of the same doc is current | Update §2 examples |
| `fieldstack-app/src/theme/tokens.ts:39`: '"Night Kickoff" type system' | Design system renamed Matchday (PR #471) | Rename in the comment |

Two more instances were already caught and fixed; they stay here as proof the rule
earns its keep (see them with `git show 02f5613 -- site/README.md`):
- `site/README.md` described `globals.css` as `"Night Kickoff" brand styles` for a
  full day after the Matchday token system shipped; PR #488 (2026-07-05) rewrote it.
- The same README kept an "After the app is live: replace the placeholder App Store
  URL (`id000000000`)" section long after the app WAS live with a real id; the dead
  instruction was only deleted in that same PR.

**Rule 2: `docs/scraping.md` is updated in the same PR as any pipeline change.** It
is the authoritative record for pipeline behavior AND the ToS/licence rules (Google
no-caching, OSM attribution, polite Overpass, Playtomic posture). Two touchpoints:
- §0 "Where we are today" must describe the pipeline as it now is.
- §5 "Recommended build order" gets the shipped marker on completed steps; the
  existing convention is a bold checkmark note, see line 405: step 2 is marked
  shipped for Toronto + Brampton with the file names.
Nothing you write may contradict or route around that doc's ToS rules.

**Rule 3: date-stamp volatile numbers.** Venue counts, page counts, measured API
results ("0 Playtomic tenants within 75km") change under you. The library convention
is "(as of YYYY-MM-DD)"; `docs/` currently has no as-of stamps at all (verified by
grep), so add them as you touch numbers rather than retrofitting in bulk.

**Rule 4: staleness found is staleness logged.** If you cannot fix a stale doc in
your current PR (out of scope), file an issue for it (section 4.3 bug shape works:
the "symptom" is the wrong claim, the "mechanism" is what shipped past it).

## 7. Where new knowledge goes

One home per fact; siblings cite the home.

| You just produced | Home | Also touch |
|---|---|---|
| An architectural decision (chose X over Y with tradeoffs) | New D-entry in `docs/architecture.md` Part II (D1 to D14 exist) | `onside-architecture-contract` skill if it creates an invariant |
| An incident (crash, regression, bad deploy) and its fix | `onside-failure-archaeology` entry | A tripwire comment in code next to the danger (section 3) |
| A process rule (how changes must ship) | `onside-change-control` | |
| A how-to recipe (run, build, deploy, measure) | The matching runbook skill: `onside-build-and-env`, `onside-run-and-operate`, `onside-diagnostics-and-tooling` | |
| Pipeline behavior or a new scrape source | `docs/scraping.md` §0/§1 + build order §5 | `onside-run-and-operate` |
| A new config axis, env var, secret, or flag | `onside-config-and-flags` | `.env.example` files |
| Domain theory (geo dedup math, GIS sources, licensing landscape) | `venue-data-reference` | |
| A copy pattern, template, or style rule | THIS skill | |
| A public claim, attribution duty, licence obligation | `onside-external-positioning` | |
| A release-mechanics fact (build numbers, OTA rules) | `docs/releasing.md` | |
| Analytics events or dashboards | `docs/analytics.md` (fix its stale rows while there, section 6) | |

## Provenance and maintenance

All facts verified against `/Users/laith/code/soccer` at HEAD `99a660d` (as of
2026-07-05). Line numbers drift; grep for quoted phrases when they do. Unverified
items are labeled inline (Rule 3 notes the as-of convention exists only in the skill
library, not yet in `docs/`). Re-verify from the repo root:

| Claim | Re-verify with |
|---|---|
| Doc line counts and inventory | `wc -l docs/*.md site/README.md` |
| scraping.md "run by hand" still stale (or fixed) | `grep -n "run by hand" docs/scraping.md` |
| scrape.yml weekly cron | `grep -n "cron" .github/workflows/scrape.yml` |
| analytics.md stale screen names | `grep -n "VenueList" docs/analytics.md fieldstack-app/src/navigation/MainNavigator.tsx` |
| Events missing from analytics.md | `grep -n "EVENT_" fieldstack-app/src/lib/analytics.ts` |
| site/README OG-image claim vs code | `grep -n "tokens" site/README.md site/app/opengraph-image.tsx` |
| Hero copy verbatim | `grep -n "Free parks included" site/app/page.tsx` |
| Title colon phrasing | `grep -n "Onside: Every" site/app/layout.tsx` |
| "New" reviews placeholder | `grep -n '"New"' fieldstack-app/src/components/ReviewSection.tsx` |
| En dash range example | `grep -n "ndash" site/app/support/page.tsx` |
| Em dash sweep holding in copy | the grep in section 2.1 |
| No new commit attribution trailers | `git log --since=2026-05-11 --format='%b' \| grep -c Co-Authored` (expect 0) |
| PR body shape | `gh pr view 488 --json body -q .body` |
| Bug issue shape | `gh issue view 454 --json body -q .body` |
| Build-order shipped marker convention | `sed -n '397,426p' docs/scraping.md` |
| Night Kickoff comment renamed yet | `grep -rn "Night Kickoff" fieldstack-app/src` |
| AGENTS.md skill count and symlink intact (as of 2026-07-12: 17 skills) | `ls -la .agents/skills && ls .claude/skills \| wc -l && grep -n "17 skills" AGENTS.md` |
| Decision count D1 to D14 | `grep -c "^### D" docs/architecture.md` |
