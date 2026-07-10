---
name: onside-research-methodology
description: >-
  The discipline that turns a hunch into an accepted change in the Onside repo
  (GTA soccer-field discovery: Expo app, Fastify API + scrape pipeline,
  Supabase, Next.js site). Load when proposing or evaluating an experiment,
  idea, or hypothesis: "let's try X", "I think the bug is Y", "should we add
  this data source", "put it behind a flag", "how do I validate this idea",
  "is this proven or a vibe", "design an experiment", "what numbers should I
  expect", "this looks better", "when do we kill this experiment", "write a
  retirement note", "who reviews this finding". Home of the evidence bar
  (one mechanism explains all observations), the numbers-before-eyes rule,
  the idea lifecycle (idea to issue to gated experiment to adopt-or-retire),
  and the experiment-design and retirement-note templates.
---

# Onside research methodology: from hunch to accepted change

This skill is the process discipline. It tells you how an idea earns its way
into the product: what counts as evidence, how experiments are isolated, and
how ideas are adopted or retired. Every rule below is backed by something that
actually happened in this repo, verified at HEAD `99a660d` (as of 2026-07-05).

Run every command in this skill from the repo root: `/Users/laith/code/soccer`.

## When NOT to use this skill

| You actually want | Go to |
|---|---|
| A concrete proof recipe (probe an API, verify on device, threshold math, migration safety) | `onside-proof-and-analysis-toolkit` |
| The full story of a past incident or settled battle | `onside-failure-archaeology` |
| The shipping evidence bar, test suites, how to add tests | `onside-validation-and-qa` |
| How changes are classified, gated, and merged (PR per issue, CI, merge commits) | `onside-change-control` |
| Measurement tools and scripts | `onside-diagnostics-and-tooling` |
| What may be claimed publicly (venue counts, "every field") | `onside-external-positioning` |
| Geo dedup math, GIS source theory, platform landscape | `venue-data-reference` |
| Open research problems worth attacking next | `onside-research-frontier` |

## The evidence bar

### Rule 1: one mechanism must explain ALL observations, including the negatives

A hypothesis that explains only the headline symptom is a candidate, not an
answer. List every observation, especially the "we changed X and nothing
happened" ones, and reject any mechanism that leaves one unexplained.

Worked example, the marker fallback investigation (commit `9d5080e`, PR #485,
2026-07-05). Observations on the Explore map, from on-device verification:

| # | Observation | Kind |
|---|---|---|
| 1 | Free-venue pins rendered as MapKit's stock red balloon, not the custom green dot | symptom |
| 2 | Restyling the custom dot component never changed the balloon at all | negative |
| 3 | With `tracksViewChanges={false}`, every pin froze on its first rasterization: placeholder teardrops before search resolved, stale prices when filter toggles reassigned venues to marker slots | symptom |
| 4 | Flipping `tracksViewChanges` at runtime crashes (settled in the May 26 marker war) | prior constraint |

The winning mechanism: MapKit displays a rasterized snapshot of each Marker's
child view. A fully transparent root view rasterizes to an EMPTY image, and
MapKit then substitutes its own default balloon, which no styling of our view
can touch (explains 1 AND the negative 2). The snapshot is taken once when
`tracksViewChanges` is false (explains 3). Runtime flips corrupt AIRMap's
subview index under the Fabric interop layer, the React Native new-architecture
bridge for the maps library (explains 4). Both shipped fixes fall out of the
mechanism rather than trial and error: give the free pin's hit area
`backgroundColor: "rgba(0,0,0,0.01)"` so the snapshot is never empty, and set
`tracksViewChanges` permanently true with memoized children.

Evidence anchors in code (read them, they are the doc of record):
`fieldstack-app/src/components/VenuePin.tsx` (rasterization comments) and
`fieldstack-app/src/screens/main/ExploreScreen.tsx` (the tracksViewChanges
block above `VenueMarkerSlot`). The incident story is homed in
onside-failure-archaeology incidents 1 and 2, the standing invariant in
onside-architecture-contract section 10; this section keeps only what the
example teaches about evidence.

### Rule 2: predict the numbers BEFORE you run

Write expected counts, latencies, error codes, and event rates into the plan
before executing. A surprise in either direction is a finding.

Worked example, the Playtomic probe (PR #457, probed live 2026-07-04). Before
the adapter was wired, the probe recorded its predictions in the adapter
header (`apps/api/scripts/scrape/sources/playtomic.ts`, lines 1 to 25): which
endpoint actually answers, which sport ids are valid, and the expected GTA
result of ZERO soccer/futsal tenants, declared the expected steady state in
both the header and the run-log line so a zero-row run is distinguishable
from a broken run. (The endpoint/enum/baseline numbers are homed in
venue-data-reference section 2.4; cite them, do not restate them.)

The same discipline is encoded mechanically in the scrape monitor: the
zero-rows guard (`ZERO_GUARD_MIN = 5` in
`apps/api/scripts/scrape/lib/monitor.ts`) fails a run when a source that
previously had 5 or more active venues suddenly fetches 0. And adapter unit
tests pin live-probed reality: `apps/api/tests/municipal.test.ts` opens with
"fixtures copied from the real property shapes probed 2026-07-05".

### Rule 3: adversarial refutation is assigned, not optional

A finding survives review only with a concrete failure scenario: specific
inputs or state that produce a specific wrong output or crash. "This could be
racy" is not a finding. Assign the refutation pass to a session or reviewer
that did NOT produce the idea, and give each reviewer a distinct lens
(correctness, data integrity, UI in both themes, ops/CI).

History that proves the payoff: the May 30 to Jun 3 review blitz merged ~51
PRs burning down review findings filed as issues 194 to 254, one issue per
finding. The Matchday redesign got its own adversarial pass which produced the
five-symptom batch fix PR #480 (`89a5ff4`: booking sync, FREE rollup, theme
flash, site parity, site CI). Findings without a failure scenario did not
become issues.

## The numbers-before-eyes rule

Success must be measurable. Never judge by vibes. Match the claim to its
instrument:

| Claim | Acceptable evidence |
|---|---|
| "The scrape found the venues" | Run summary counts per source compared against the predicted counts; zero-rows and write-failure guard status (`apps/api/scripts/scrape/lib/monitor.ts`) |
| "The UI is right" | Screenshots in BOTH themes, compared against expectations stated before capturing. Repeatable capture: `.maestro/screenshots.yaml` (needs a dev build, not Expo Go) |
| "Users do X" | PostHog event rates; the typed event inventory is `fieldstack-app/src/lib/analytics.ts` |
| "It is faster" | Latencies measured before and after on the same query set |
| "These venues are duplicates" | Dry-run pair output reviewed by a human; only the conservative AUTO tier applies unattended |
| "Coverage improved" | Counts per source AND a recall measurement against ground truth (see anti-pattern 3 below) |

How to measure is `onside-diagnostics-and-tooling`; what evidence a merge
needs is `onside-validation-and-qa`.

## The idea lifecycle

Every idea walks these stages. Skipping one is how untested code reaches the
user path.

| Stage | Rule | Exemplar in this repo |
|---|---|---|
| 1. Idea | Write it down with its predicted numbers (template below) | Playtomic header, before any code |
| 2. Issue | One GitHub issue per change. Never bundle. Gating and merge mechanics: `onside-change-control` | 286 merged topic branches, one issue each |
| 3. Isolated experiment | Behind a feature flag OR a scratch/dry-run script. NEVER in the user path | `in_app_booking` flag; `dedupe.ts` and `refine.ts` are dry-run by default, writes need `--apply` |
| 4. Gate declared in advance | The adopt/retire measurement goes in the issue BEFORE the experiment runs | Playtomic: "zero tenants is success" was pre-declared |
| 5a. Adopt | Normal change control: PR closes the issue, CI green, merge commit | every merged PR |
| 5b. Retire | Documented reason (template below); the durable entry goes to `onside-failure-archaeology` | clustering dropped in PR #145; icon saga ended by revert PR #181 (`264464a`) |

### The flag exemplar: in_app_booking (as of 2026-07-05, the only flag)

Study `fieldstack-app/src/lib/featureFlags.ts` before adding any flag. The
pattern to copy:

- Default is OFF: `resolveFlag` returns true only for an exact PostHog `true`;
  no override plus no PostHog key means false, "nothing changes for anyone".
- Dev override for local work: `EXPO_PUBLIC_FF_IN_APP_BOOKING=1` forces it on
  so a simulator build can exercise the flow before the PostHog flag exists.
- Remote kill/launch switch: PostHog dashboard key `in_app_booking`, no app
  update required to flip.
- The regression test pins the OLD path, not the new one:
  `fieldstack-app/src/lib/__tests__/bookingAction.test.ts` asserts flag OFF
  yields the operator redirect for BOTH signed-in and signed-out ("unchanged
  current behavior"). The flag-off path IS the user path; protect it first.
- DB groundwork ships inert: migration
  `supabase/migrations/025_booking_requests.sql` is harmless while the flag is
  off (RLS: own insert, own read, cancel-only update).

### The scratch-script exemplar

Data experiments run as scripts under `apps/api/scripts/`, service-role,
outside the API server. They default to read-only or dry-run and print what
they WOULD do; mutation requires an explicit `--apply` flag. Copy that shape
for any new data experiment. Example invocations (run from
`/Users/laith/code/soccer/apps/api`, needs `.env` with Supabase secrets):

```bash
bun scripts/scrape/dedupe.ts            # dry run: prints AUTO and REVIEW pairs
bun scripts/scrape/dedupe.ts --apply    # deactivates AUTO losers (reversible soft delete)
bun scripts/scrape/refine.ts            # dry run of google-source cleanup
```

## Where good ideas historically came from

Mine these veins; they have all paid out at least once.

| Source | Worked case | Evidence |
|---|---|---|
| Live probes of undocumented external APIs | Playtomic endpoint drift, valid sport enums, and the zero-tenant steady state were all discovered by probing before coding | `apps/api/scripts/scrape/sources/playtomic.ts` header; PR #457 |
| Competitor gap research | The CatchCorner analysis named the gaps (completeness, reviews, SEO) that became the positioning wedge; the site H1 "Free parks included." followed in the Matchday site restyle | `docs/business-plan.md` line 70; `site/app/page.tsx`; commit `4ae9a73` (PR #477) |
| Reviewer findings promoted to work | ~51 merges May 30 to Jun 3 from review-finding issues 194 to 254; PR #480 batch fix after the Matchday adversarial review | `git log --oneline --merges --since=2026-05-30 --until=2026-06-04` |
| On-device verification | PR #485 found and fixed pin rendering bugs no test or simulator-free review could see | commit `9d5080e` |
| Municipal open-data research | Toronto and Brampton adapters landed in a single commit on 2026-07-05; Mississauga earlier the same week | commit `7e2fc71` (PR #467); PR #459 |

Unverified origin note: the claim that the FREE-as-first-class treatment (foil
badge, H1 line) was born in one specific competitive review is not recoverable
from git alone. What is verifiable: the business plan documents the incumbent
gap, and the FREE badge plus H1 shipped later with the Explore rebuild and
Matchday restyle.

## Settled battles: the reopening rule

Settled battles (the marker pool, migration guard, npm-for-mobile, and the
rest) live in `onside-failure-archaeology`. Do not relitigate them from taste.

Exactly one settled decision has ever been legitimately overturned, and it is
the template: `tracksViewChanges` was settled as permanently FALSE during the
May 26 marker war; PR #485 flipped it to permanently TRUE on 2026-07-05 with
(a) new on-device observations the old rule could not explain, (b) a mechanism
that explained every observation including the original crash, and (c)
on-simulator verification of the replacement rule. That is the entry fee. New
evidence of that quality, or the battle stays settled.

## Anti-patterns, fenced

| # | Anti-pattern | Why it is fenced | Instead |
|---|---|---|---|
| 1 | Relitigating settled battles | Each one cost real incident time | Read `onside-failure-archaeology`; meet the reopening bar above |
| 2 | Tuning thresholds without labeled data | Dedupe constants (`AUTO_RADIUS_M` 200, `AUTO_NAME_SIM` 0.85, `REVIEW_RADIUS_M` 100, `REVIEW_NAME_SIM` 0.3, `AUTO_RADIUS_GENERIC_M` 30 in `apps/api/scripts/scrape/lib/dedupe.ts`) were set against live-confirmed pairs, e.g. Toronto ROLLUP_TO variants 17 to 116 m apart (`sources/toronto.ts` parkKey comment) | Build a labeled pair set first; measure precision/recall of old vs new values on it. Recipe: `onside-proof-and-analysis-toolkit` |
| 3 | Claiming coverage without recall measurement | Adding N venues says nothing about what is still missing; "every field" is a public claim with an owner (`onside-external-positioning`) | Measure recall against a ground-truth sample (e.g. manually enumerate one neighbourhood, compute hit rate). Open gap: no recall harness exists yet (as of 2026-07-05) |
| 4 | Shipping UI claims without both-theme screenshots | Every themed surface has independent light and dark values (`design/tokens.json`); the PR #480 theme flash and the balloon regression were each invisible in the surface nobody screenshotted | Capture both themes against pre-stated expectations; `.maestro/screenshots.yaml` for repeatability |
| 5 | Testing only the flag-ON path | The flag-off path is what every user runs today | Pin flag-off behavior first, like `bookingAction.test.ts` |
| 6 | "Looks right to me" | Vibes are not evidence | Numbers-before-eyes table above |

## Experiment-design template

Copy into the GitHub issue before writing code. Every field is mandatory; an
experiment without a gate date is a leak.

```markdown
## Experiment: <short name>
- Issue: #NNN (one issue per experiment)
- Hypothesis (a mechanism, not just an outcome): <why X should cause Y>
- Predicted numbers (written BEFORE running): <expected counts / latencies /
  error codes / event rates, with the command or query that will produce them>
- Negative predictions (what must NOT change): <e.g. flag off means zero
  behavioral diff; existing source counts stay within guard bounds>
- Isolation: feature flag `<name>` (default OFF) | dry-run script under
  apps/api/scripts/ (writes need --apply) | read-only probe script
- User-path guard: regression test pinning CURRENT behavior at <test path>
- Measurement: <exact command + run-from path, or PostHog query>
- Gate (decided in advance): adopt if <measured threshold>; retire if <condition>
- Refutation: assigned to <independent session/reviewer> with lens <correctness
  | data integrity | UI both themes | ops>; finding must state a concrete
  failure scenario to count
- Review-by date: <YYYY-MM-DD>
```

## Retirement-note template

When the gate says no, retire loudly, not silently. Close the issue with this
note and add the durable entry to `onside-failure-archaeology`.

```markdown
## Retired: <idea>
- Tried: <dates>, issue #NNN, PR(s) #NNN
- Predicted vs measured: <the numbers, side by side>
- Why retired (mechanism or measurement, never taste): <reason>
- What remains: <code deleted | kept behind flag OFF | branch name (branches
  are never deleted in this repo, the history stays browsable)>
- Do not retry unless: <the specific new evidence that would reopen this>
```

Worked retirements to imitate: map clustering (shipped early, retired by
PR #145 "Drop clustering + replace map carousel with single Google-Maps card",
commit `c8a5a55`) and the app-icon saga (10 iteration PRs ended by reverting
to the PR #176 design, commit `264464a`; the revert subject documents exactly
what was kept and dropped).

## Provenance and maintenance

Run from `/Users/laith/code/soccer`. Each line re-verifies one fact above; if
a check fails, fix this skill before trusting it.

```bash
# Marker mechanism comments still in code (Rule 1 example)
grep -n "rasterizes" fieldstack-app/src/components/VenuePin.tsx
# tracksViewChanges settled as permanently TRUE
grep -n "permanently TRUE" fieldstack-app/src/screens/main/ExploreScreen.tsx
# Flag default false + dev override name
grep -n "EXPO_PUBLIC_FF_IN_APP_BOOKING\|posthogValue === true" fieldstack-app/src/lib/featureFlags.ts
# Flag-off regression pin
grep -n "unchanged current behavior" fieldstack-app/src/lib/__tests__/bookingAction.test.ts
# Playtomic pre-declared expectations (endpoint, enums, zero steady state)
sed -n '1,25p' apps/api/scripts/scrape/sources/playtomic.ts
# Zero-rows guard constant
grep -n "ZERO_GUARD_MIN" apps/api/scripts/scrape/lib/monitor.ts
# Dedupe thresholds
grep -n "export const" apps/api/scripts/scrape/lib/dedupe.ts
# Live-probed fixtures note
head -25 apps/api/tests/municipal.test.ts | grep -n "probed"
# Review-blitz volume (expect ~51)
git log --oneline --merges --since=2026-05-30 --until=2026-06-04 | wc -l
# CatchCorner gap analysis present
grep -n "CatchCorner" docs/business-plan.md | head -3
# Clustering retirement + icon-saga revert commits exist
git show c8a5a55 -s --format="%h %s"; git show 264464a -s --format="%h %s"
# Dry-run-by-default runners
grep -n -- "--apply" apps/api/scripts/scrape/dedupe.ts | head -3
# Flag count (this skill says one flag as of 2026-07-05)
grep -n "FlagName =" fieldstack-app/src/lib/featureFlags.ts
```
