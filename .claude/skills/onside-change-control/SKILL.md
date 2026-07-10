---
name: onside-change-control
description: >
  How changes ship in the Onside repo (soccer field discovery, GTA). Load this BEFORE
  making any code, migration, token, config, or data change, and whenever you are about
  to branch, commit, stage files, open a PR, merge, push a migration, edit design colors,
  rename a storage key, add a feature flag, or run a script against production data.
  Trigger phrases: "make a change", "open a PR", "commit this", "merge", "add a migration",
  "change the theme/colors", "run the scraper against prod", "clean up venues",
  "add a feature flag", "why can't I use bun here", "should I squash", "git add -A".
---

# Onside Change Control

This skill defines how any change gets classified, gated, and merged in the repo at
`/Users/laith/code/soccer` (GitHub: `LaithAlz/fieldstack`). Every rule here has an incident
or a concrete cost behind it. Full incident narratives live in `onside-failure-archaeology`;
this skill states the rule, the why, and the citation.

Jargon used once and defined here:
- **EAS**: Expo Application Services, the cloud build/submit system for the iOS app.
- **OTA**: over the air JS update to the live app via EAS Update, no App Store review.
- **RLS**: Postgres Row Level Security, the Supabase permission layer.
- **Soft delete**: setting `is_active = false` on a row instead of SQL DELETE.

## When NOT to use this skill

- You need to build or run the code, not change it: see `onside-build-and-env` and `onside-run-and-operate`.
- You are debugging a symptom: see `onside-debugging-playbook`.
- You want the story behind an incident referenced here: see `onside-failure-archaeology`.
- You need config axes, env vars, or flag wiring detail: see `onside-config-and-flags`.
- You are writing docs or user copy and need house style detail: see `onside-docs-and-writing`.
- You are validating a change (tests, evidence bar): see `onside-validation-and-qa`.

## 1. Change classification: what your diff touches decides what gates it

There is no root package.json. Three independent Node projects plus shared roots. Classify
your change first; each class has different CI gates and different deploy consequences.

| Class | Paths | CI gate (on PR) | What merging to main does |
|---|---|---|---|
| App | `fieldstack-app/` | `ci.yml` mobile job: `npm ci`, typecheck, lint, jest (includes token drift test) | Nothing auto-ships. Users get it only via an EAS build or an OTA update (see `onside-run-and-operate`) |
| Site | `site/` | `ci.yml` site job: `npm ci`, token drift check, `next build` | Vercel watches main and deploys getonside.ca (Root Directory = `site`, configured in the Vercel dashboard, no vercel.json in repo) |
| API server | `apps/api/src/` | `ci.yml` backend job: `bun install --frozen-lockfile`, typecheck, `bun test` | Deploy is MANUAL: `cd apps/api && flyctl deploy --remote-only` (no deploy workflow is tracked; corrected 2026-07-09). Merging does NOT deploy the API |
| Scrape pipeline | `apps/api/scripts/scrape/` | same backend job | Next weekly `scrape.yml` run (Mondays 08:00 UTC) executes your code against PROD data with the service role key |
| Migration | `supabase/migrations/**`, `supabase/config.toml` | `migrations.yml`: boots a fresh local Postgres and applies ALL migrations from scratch; optional remote drift check | Nothing. Prod schema changes ONLY via manual `bun run db:push` from `apps/api/` AFTER merge (section 5) |
| Design tokens | `design/tokens.json` + regenerated outputs | two drift guards fail CI if outputs are stale (section 6) | Site side deploys via Vercel; app side waits for a build/OTA |
| Docs | `docs/`, READMEs | full CI still runs | No deploy effect |

Two classes deserve fear: merging API code deploys it within minutes, and merging pipeline
code arms a scheduled prod-data run. Treat both like production changes, because they are.

## 2. The PR discipline (non-negotiable workflow)

Verified against history: 644 commits, 286 merged PRs, zero unmerged branches (as of 2026-07-06, HEAD `99a660d`).

1. **One GitHub issue per change, one PR per issue.** Create the issue first if none exists.
2. **Branch off main**, named `<type>/<issue>-<slug>`, e.g. `fix/454-gallery-dots-crash`,
   `feat/452-starting-at`. Observed types by frequency: `fix/`, `feat/`, `ui/`, `chore/`,
   `docs/`, `refactor/`, `ci/`.
3. **PR body starts with `Closes #N`** so the issue auto-closes on merge. Then a short
   scope description and a "Verified" section listing what you actually ran.
4. **Wait for CI green before merging.** Poll with:
   ```bash
   gh pr checks <PR-number> --watch
   ```
   Important honest caveat: `main` has NO GitHub branch protection (verified 2026-07-05 via
   `gh api repos/LaithAlz/fieldstack/branches/main/protection`, returns 404). Nothing
   mechanically stops a red merge. The rule holds by discipline only. Do not be the first
   to break it.
5. **Merge with a merge commit, never squash, never rebase:**
   ```bash
   gh pr merge <PR-number> --merge
   ```
   All 286 PR merges in history are real merge commits ("Merge pull request #N
   from LaithAlz/<branch>"); the single other merge commit is a legacy
   `origin/main` sync (`b0e0c27`). The branch slug doubles as the searchable PR title in
   `git log --merges`. Branches are never deleted after merge; the kept branches are the
   repo's archaeology.
6. **Commit messages: short imperative subject, no attribution trailers.** No
   `Co-Authored-By: Claude`, no "Generated with Claude Code" footers in commits or PR
   bodies. (Eleven early May 2026 commits predate this rule; nothing since. Do not add new ones.)
7. Commit each coherent change as you go. Do not pile up one giant uncommitted diff.

### Staging: never `git add -A`

Stage explicit paths only (`git add fieldstack-app/src/lib/foo.ts`). The working tree
routinely contains files that must never be committed: local `.env` files, `bun.lock`
(gitignored, see section 3), `dump.rdb`, `site/.next/`, prebuild `ios/`/`android/` dirs,
and local agent scratch files. `git add -A` is how one of those ends up in history.

## 3. Lockfiles and package managers (the bun/npm split)

**`package-lock.json` is the lockfile of record in all three projects. `bun.lock` is
gitignored** (root `.gitignore` lines 6-8: committing bun.lock "breaks the frozen-lockfile
install"). Never commit a bun.lock; never delete a package-lock.json.

| Project | Install with | Why |
|---|---|---|
| `apps/api` | bun (`bun install`); server runs under Node via tsx; tests under `bun test` | CI backend job uses bun against package-lock.json |
| `fieldstack-app` | **npm ONLY** (`npm ci` / `npm install`) | See incident below |
| `site` | npm | CI and Vercel both use npm |

**Why fieldstack-app is npm only:** bun's `node_modules` hoisting diverges from npm's and
broke EAS production builds, stuck on the splash screen (June 2026 launch-hardening cluster;
full mechanism and fix chain: onside-failure-archaeology incident 6, commits `fd49d89` PR #419
and `e79cfa8` PR #429). The rationale comment is pinned in `.github/workflows/ci.yml` above
the mobile job's setup-node step. Running `bun install` in `fieldstack-app/` recreates the
divergence; do not do it even for speed.

## 4. Flag-gated behavior changes: default OFF, pin the OFF path

Any change that alters user-facing behavior behind a feature flag MUST:
1. Default OFF when the flag source is unavailable (`resolveFlag` in
   `fieldstack-app/src/lib/featureFlags.ts` returns true only for an exact PostHog `true`;
   anything else, including no PostHog key, resolves false).
2. Ship a regression test that pins the OFF path to the exact pre-flag behavior.

Exemplar: `in_app_booking`. `resolveBookingAction` in `fieldstack-app/src/lib/bookingAction.ts`
is a pure function whose header states the invariant: "flag OFF always means the unchanged
operator redirect, for every signed-in state." Its test
(`src/lib/__tests__/bookingAction.test.ts`) asserts redirect for BOTH signed-in and
signed-out when `flagOn: false`. Copy this pattern: pull the decision into a pure function,
test the OFF matrix, only then wire it into screens. The migration backing the flag
(`025_booking_requests.sql`) merged with the flag dark; that is the intended sequencing.

## 5. Migrations: CI proves fresh-apply, a human pushes prod

- Migrations live at `supabase/migrations/` (25 files, `001` to `025`, as of 2026-07-05).
  Numbering is sequential three-digit prefixes; take the next number.
- Any PR touching `supabase/migrations/**` or `supabase/config.toml` triggers
  `migrations.yml`, which runs `bunx supabase start --workdir ../..` from `apps/api`:
  a fresh local Postgres applying EVERY migration from scratch. If yours cannot apply on a
  clean database, CI is red.
- **Merging does NOT change prod.** After merge, apply manually:
  ```bash
  cd /Users/laith/code/soccer/apps/api
  bun run db:push        # supabase db push --workdir ../.. to the linked prod project
  ```
  `migrations.yml` also has an optional secret-gated drift check that fails future PRs if a
  merged migration was never pushed, so do not leave this step hanging.
- **The incident this CI exists for (migration 019):** `CREATE OR REPLACE FUNCTION` across
  a return-type change applied fine on the already-migrated prod but broke every fresh
  replay (bad commit `094fd3d`; fix `310e907` adds `drop function if exists` first; the
  fresh-apply CI guard followed in `87bf9ef`, PR #325). Full story:
  onside-failure-archaeology incident 5; the function-change decision table:
  onside-proof-and-analysis-toolkit Recipe 6. Rule: changing a function's return type means
  drop-then-create, and always ask "does this apply to an empty database, in order, from 001?"
- RLS conventions to preserve: `drop policy if exists` before `create policy` (idempotent
  replays); public catalog reads gate on `is_active`; user tables gate every verb on
  `auth.uid() = user_id`. Enum extensions (`ALTER TYPE ... ADD VALUE`) must not run inside
  a transaction block (see migration 008).

## 6. Design changes go through tokens.json, nothing else

`design/tokens.json` is the single source of truth for all colors, spacing, radii, and font
sizes across app and site (the "Matchday" system). To change any of them:

```bash
cd /Users/laith/code/soccer
# 1. Edit design/tokens.json
node design/generate.mjs
# 2. Stage tokens.json PLUS all generated outputs together
```

Never hand-edit a generated output (each header says so); two independent CI guards fail if
you hand-edit one or forget to regenerate. The output paths and drift-guard detail are homed
in onside-config-and-flags ("Design tokens as configuration"); do not restate them here.

One deliberate exception: `fieldstack-app/src/components/ErrorBoundary.tsx` hardcodes hex
colors and uses raw RN Text/Pressable. This is intentional, not drift. The crash fallback
must not call `useTheme()` or themed components: if the crash originated in the theme layer,
the fallback itself would re-throw and white-screen the app (comment in the file, around
lines 39-42). Do not "clean it up" to use tokens.

## 7. App data compatibility: AsyncStorage keys are forever

All persisted app state uses keys prefixed `@fieldstack/` (theme_preference, saved_venues,
booking_history, recently_viewed, preferred_slot, blocked_user_ids, review_prompt,
onboarding_complete, caches). The prefix survived the FieldStack to Onside rebrand on
purpose, and PR #488's body records "AsyncStorage keys deliberately untouched" during the
package rename.

**Rule (codified here; previously de facto): NEVER rename an existing AsyncStorage key.**
There is no key-migration layer in the app. A renamed key silently orphans every user's
saved venues, booking history, theme choice, and onboarding state on their next update.
New keys are fine; keep the `@fieldstack/` prefix for consistency. If a key's VALUE shape
must change, keep the key and handle the legacy shape on read (existing pattern:
`bookingHistory.tsx` backfills ids on old entries; `storage.ts` filters pre-015 filter blobs).

## 8. User-facing copy is dash-free

No em dashes and no en dashes in any rendered string, in app or site. Rationale recorded in
PR #401 ("em dashes are a classic AI tell"); enforced again in PRs #481/#482. Replace with a
comma, period, colon, parentheses, or a rewrite. Numeric ranges spell it out ("5-a-side to
11-a-side") or use HTML `&ndash;` in site prose where a range mark is conventional. Code
comments are exempt. If you add copy, scan your diff for the characters before committing.
House style detail lives in `onside-docs-and-writing`.

## 9. Scraping and ToS rules are not overridable

`docs/scraping.md` section 4.4 ("ToS, legal, rate limits") is the doc of record. No change
may contradict it or route around it. Summary of what it binds (read the section itself
before touching any adapter):
- OSM: keep ODbL attribution; keep the polite Overpass pattern in `osm.ts` (per-city
  queries, backoff, User-Agent).
- Google Places: **never store content durably** (names, hours, ratings, photo bytes). The
  one storable field is the Place ID (`venues.google_place_id`, migration 024). Photos are
  stored as short-lived keyless googleusercontent URIs and re-resolved weekly; attribution
  strings are stored and displayed (migration 022).
- Playtomic internal API: discovery only, sparing, clear User-Agent; never load-bearing.
- CourtReserve/Amilia: only with a club's consent and credentials.
- Any new HTML-scraping source needs a robots/ToS check first.

**Google Places cost discipline:** requests use a tight FieldMask ("Keeping it tight
controls the billing SKU", `apps/api/scripts/scrape/sources/googlePlaces.ts`), and Places
calls run on the scheduled weekly workflow, not ad hoc. Do not run `bun run scrape -- google`
or `enrichPhotos.ts` casually against prod; each run costs real money. If you must test,
use `--limit N` on enrichPhotos or point at local Supabase.

## 10. Production data scripts: dry-run first, soft-delete only

Scripts in `apps/api/scripts/scrape/` run with the service role key (RLS bypassed) against
prod. Rules, all verified in the shipped scripts:
- **Dry run is the default; `--apply` is the explicit opt-in.** `dedupe.ts` and `refine.ts`
  both print the full plan and write nothing unless `--apply` is passed. Any new data
  script MUST follow this shape.
- **Never SQL DELETE a catalog row.** Deactivation is `is_active = false` plus an audit
  column when applicable (`duplicate_of = keeper.id` for dedupe losers). Every read path
  (list API, map RPC, search, RLS policies) already gates on `is_active`, so a deactivated
  row simply disappears, reversibly.
- Scrape upserts are idempotent on `external_id` (`run.ts` uses
  `onConflict: "external_id"`); real UNIQUE constraints back this (migration 014).
- **The one hard-deleting script is `apps/api/scripts/seed.ts`**: it wipes fields, venues,
  and operators entirely and inserts fake dev data. It is a local-dev bootstrap. It reads
  `SUPABASE_URL` from `apps/api/.env`; if that file points at prod, `npm run seed` destroys
  the production catalog. Check the env before running it, every time.

## 11. Pre-merge checklist (copy into your PR flow)

- [ ] Issue exists; branch named `type/<issue>-slug`; PR body opens with `Closes #N`
- [ ] Staged explicit paths only; no `.env`, `bun.lock`, `dump.rdb`, build artifacts in the diff
- [ ] Used npm in `fieldstack-app/` (never bun there)
- [ ] Token edits: regenerated via `node design/generate.mjs`, all outputs staged
- [ ] Migration: applies to a fresh DB from 001; `migrations.yml` green
- [ ] Flag-gated behavior: defaults OFF; OFF-path regression test added
- [ ] No renamed AsyncStorage keys; no em/en dashes in rendered strings
- [ ] Nothing contradicts `docs/scraping.md` section 4.4
- [ ] `gh pr checks <N> --watch` all green, then `gh pr merge <N> --merge`
- [ ] Migration PRs only: `cd apps/api && bun run db:push` after merge
- [ ] Remember what merge deploys: API to Fly immediately, site to Vercel, pipeline armed for Monday

## Provenance and maintenance

All facts verified against the repo at HEAD `99a660d` (2026-07-05; merge counts re-verified 2026-07-06). One-line re-checks:

| Fact | Re-verify with (from repo root) |
|---|---|
| bun.lock gitignored, rationale comment | `sed -n 1,10p .gitignore` |
| Mobile CI is npm, with rationale comment | `grep -n -A4 "npm (not bun)" .github/workflows/ci.yml` |
| npm-unification and babel-preset commits | `git log --oneline -1 e79cfa8; git log --oneline -1 fd49d89` |
| Merge commits, branch naming | `git log --merges --oneline -10` |
| PR merge count (286) and the one non-PR merge | `git log --oneline --merges --grep="Merge pull request" \| wc -l; git log --oneline --merges \| grep -v "Merge pull request"` |
| No branch protection on main | `gh api repos/LaithAlz/fieldstack/branches/main/protection` (expect 404) |
| Migration count and fresh-apply CI | `ls supabase/migrations \| wc -l; grep -n "supabase start" .github/workflows/migrations.yml` |
| Migration 019 drop-first fix | `sed -n 1,12p supabase/migrations/019_venues_within_id_only.sql` |
| db:push script | `grep -n db:push apps/api/package.json` |
| Token drift guards | `grep -n -B2 "git diff --exit-code" .github/workflows/ci.yml; ls fieldstack-app/src/lib/__tests__/tokensDrift.test.ts` |
| ErrorBoundary no-theme rationale | `grep -n "useTheme" fieldstack-app/src/components/ErrorBoundary.tsx` |
| AsyncStorage prefix inventory | `grep -rn "@fieldstack/" fieldstack-app/src --include="*.ts*" \| grep -v __tests__` |
| Flag OFF default | `grep -n -A3 "export function resolveFlag" fieldstack-app/src/lib/featureFlags.ts` |
| OFF-path regression test | `grep -n "flag OFF" fieldstack-app/src/lib/__tests__/bookingAction.test.ts` |
| Dedupe soft-delete | `grep -n "is_active: false, duplicate_of" apps/api/scripts/scrape/dedupe.ts` |
| ToS rules | `sed -n "/^### 4.4/,/^### 4.5/p" docs/scraping.md` |
| Places field mask comment | `grep -n -B1 "FIELD_MASK" apps/api/scripts/scrape/sources/googlePlaces.ts` |
| seed.ts hard delete | `grep -n "delete()" apps/api/scripts/seed.ts` |

Unverified/volatile items, flagged inline above: absence of branch protection could change
via GitHub settings at any time; the memory-based rules (no `git add -A`, no attribution
trailers, CI-before-merge) are owner directives evidenced by history but not machine-enforced.
