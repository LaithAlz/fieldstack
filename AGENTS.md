# Agent instructions (Onside repo)

Entry point for coding agents that read AGENTS.md (Codex CLI and anything else that
follows the convention). The maintained knowledge base is the skill library in
`.agents/skills/`; this file says when to read which skill and lists the hard rules
that must hold even if you read nothing else. Claude Code loads the same library from
`.claude/skills/`; `.agents/skills` is a symlink to it, so there is exactly one copy
to maintain.

Onside is a soccer-field discovery product for the Greater Toronto Area:

- `fieldstack-app/`: Expo iOS app (live on the App Store, id 6780034337)
- `apps/api/`: Fastify API on Fly.io plus the scrape pipeline (writes to prod Supabase)
- `site/`: Next.js marketing site, deployed to getonside.ca by Vercel on merge to main
- `supabase/migrations/`: Postgres schema, pushed to prod manually

There is no root package.json; the three Node projects are independent.

## Read the skill before you act

Each folder in `.agents/skills/` has a `SKILL.md` whose frontmatter description says
exactly when it applies. The moments that matter most:

| Moment | Skill |
|---|---|
| Before ANY change (code, migration, tokens, config, data) | `onside-change-control` |
| Before claiming a change is done, tested, or mergeable | `onside-validation-and-qa` |
| Running or shipping something that exists (scrape, deploys, EAS, db:push) | `onside-run-and-operate` |
| Something is broken and you need triage | `onside-debugging-playbook` |
| Touching load-bearing architecture or invariants | `onside-architecture-contract` |
| Env vars, secrets, feature flags | `onside-config-and-flags` |
| Machine setup, installs, first build | `onside-build-and-env` |
| Writing docs, user copy, commits, PRs, issues | `onside-docs-and-writing` |
| Any outward-facing claim (site copy, App Store text) | `onside-external-positioning` |
| Venue data theory: dedupe math, sources, licensing, taxonomy | `venue-data-reference` |
| Measuring the system instead of eyeballing it | `onside-diagnostics-and-tooling` |
| Proving a hypothesis with a repeatable recipe | `onside-proof-and-analysis-toolkit` |
| Research process and the open-problem map | `onside-research-methodology`, `onside-research-frontier` |
| Past incidents in depth | `onside-failure-archaeology` |
| App Store launch and release campaign work | `onside-launch-campaign` |
| Generating favicons or app icons | `favicon-gen` |

## Hard rules

One-line digests only; the cited skill or doc is the record and has the why.

Workflow (home: `onside-change-control`):

- One GitHub issue per change; branch `type/<issue>-slug`; PR body opens with
  `Closes #N`; wait for CI green (`gh pr checks <N> --watch`); merge with
  `gh pr merge <N> --merge` (merge commit, never squash, never rebase). Branches are
  kept after merge.
- Stage explicit paths only, NEVER `git add -A`: the working tree routinely holds
  `.env` files, `bun.lock`, and build artifacts that must never land in history.
- Commit subjects: short imperative, no AI attribution trailers or "generated with"
  footers in commits or PR bodies.

Package managers (home: `onside-change-control` section 3):

- `package-lock.json` is the lockfile of record in all three projects; `bun.lock` is
  gitignored. Never commit a bun.lock.
- npm ONLY in `fieldstack-app/` (bun's hoisting broke EAS production builds); bun in
  `apps/api/`; npm in `site/`.

Design (home: `onside-change-control` section 6):

- Every color, spacing, radius, and font size comes from `design/tokens.json`. Edit
  it, run `node design/generate.mjs`, stage the token file plus all generated outputs
  together. Never hand-edit a generated output. Known exception: `ErrorBoundary.tsx`
  hardcodes hex on purpose; leave it.

Data and schema (home: `onside-change-control` sections 5, 7, 10):

- Migrations: take the next sequential 3-digit number and make sure the file applies
  to a fresh database from 001. Merging does NOT touch prod; a human runs
  `cd apps/api && bun run db:push` after merge.
- Never rename an existing AsyncStorage key (`@fieldstack/` prefix). There is no key
  migration layer; a rename silently orphans user data.
- Prod data scripts: dry run is the default and `--apply` is the explicit opt-in;
  never SQL DELETE a catalog row (soft delete via `is_active = false`);
  `apps/api/scripts/seed.ts` wipes whatever `SUPABASE_URL` points at, so check
  `apps/api/.env` before running it.

Copy (home: `onside-docs-and-writing`):

- No em dashes and no en dashes in any rendered user-facing string, app or site.

Scraping (home: `docs/scraping.md` section 4.4, binding):

- Never durably store Google Places content; the Place ID is the only storable
  field. Google Places runs cost real money; do not run them ad hoc against prod.

What merging to main deploys (home: `onside-run-and-operate`):

- `site/` auto-deploys to getonside.ca via Vercel. The API deploy is MANUAL
  (`cd apps/api && flyctl deploy --remote-only`); merging API code ships nothing by
  itself. Merged scrape-pipeline code runs against prod data on the next weekly
  Monday 08:00 UTC workflow.

## Maintenance

As of 2026-07-12 the library holds 17 skills. If you add, rename, or remove a skill,
update this file's table and the doc map in `onside-docs-and-writing` section 1 in
the same PR.
