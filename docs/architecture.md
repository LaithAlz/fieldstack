# Onside — Architecture: What It Is, and Why

This document explains the whole Onside system **and the reasoning behind it**:
what each piece is, what alternatives were on the table, why the current choice
won, and what we gave up to get it.

It's written in plain language — no prior knowledge assumed. Every technical
term is spelled out the first time it appears, and there's a full
**[glossary](#glossary)** at the end. Diagrams are plain text so they render
anywhere (GitHub, an editor, a terminal).

**How to read it:**
- [Part I — What the system is](#part-i--what-the-system-is) — the overview.
- [Part II — The decisions](#part-ii--the-decisions-and-the-alternatives) — the
  *why*, one architectural choice at a time, each with alternatives + tradeoffs.
- [Part III — Limits and growth](#part-iii--limits-and-growth) — what this
  design is deliberately bad at, and what changes as Onside scales.

---

# Part I — What the system is

## 1. The one constraint that shapes everything

**Onside helps people find a soccer field to play on in the Toronto area, then
sends them to that field's own website to book it.**

It's a "Google Maps for soccer fields": a clean, complete list of every field in
the region, on a map, with prices and details — and when you want to play, we
hand you off to whoever actually takes the booking. **Onside does not take your
money or hold your reservation.** It's the *discovery* layer.

That single fact — **discovery, not transactions** — is the most important thing
in this document. It explains nearly every decision below:

- The system is **read-heavy and write-light**. Millions of "show me fields
  near here" reads; almost no writes from users (a save, a review).
- It can tolerate **slightly stale data**. A field's details being a minute (or
  a week) old is fine. Nobody loses money over it.
- It needs **no real-time machinery** — no live seat maps, no payment
  consistency, no holding a slot while you pay.

A booking *transaction* system would need the opposite of all three. We don't
build for that yet — and Part III explains where it would slot in if we did.

## 2. The system in one picture

```
        PEOPLE                               ROBOTS (scheduled)
   ┌───────────────┐  ┌───────────────┐    ┌────────────────────────┐
   │ Player on      │  │ Visitor in a   │    │ Scraping scripts        │
   │ iPhone         │  │ web browser    │    │ (find/clean fields)     │
   └───────┬───────┘  └───────┬───────┘    └────────────┬───────────┘
           │                  │                          │ writes (service-role
           │ "fields near me" │ reads venues ONCE,       │ key, bypasses RLS)
           ▼                  │ at build time            │
   ┌───────────────┐         │                          │
   │ MOBILE APP     │         │                          │
   │ (Expo / RN)    │         ▼                          │
   └───┬───────┬───┘  ┌───────────────┐                  │
       │       │      │ WEBSITE        │                  │
 cached│       │auth +│ (Next.js SSG)  │                  │
 reads │       │ own  └───────────────┘                  │
       ▼       │ rows         │                          │
   ┌───────────────┐         │ (both use the low-priv    │
   │ API SERVER     │         │  anon key + RLS)          │
   │ (Fastify+Redis)│         │                          │
   └───────┬───────┘         │                          │
           │                  │                          │
           ▼                  ▼                          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │            SUPABASE  —  Postgres + PostGIS + Auth + RLS         │
   │     The single source of truth: operators, venues, fields,     │
   │            users, reviews, saves. RLS guards every row.         │
   └──────────────────────────────────────────────────────────────┘
```

Note the two different paths from the app: heavy/public **reads go through the
cached API server**, while **login and your-own-data go straight to Supabase**
(secured by RLS). That hybrid is a deliberate decision — see [D5](#d5--clients-talk-straight-to-supabase-for-auth--their-own-data-the-hybrid).

## 3. The parts

| # | Part | In plain words | Built with |
|---|------|----------------|------------|
| 1 | **Mobile app** | The iPhone app players use. | Expo / React Native |
| 2 | **Website** | Marketing + one page per venue so Google can find us. | Next.js (static) |
| 3 | **API server** | The cached "gatekeeper" the app phones for venue data. | Fastify + Redis |
| 4 | **Scraping scripts** | Robots that find new fields and add them. | TypeScript (Bun) |
| 5 | **Database** | The single store everything reads from. | Supabase (hosted Postgres) |

The repo is a monorepo: `apps/api/` (3 + 4), `fieldstack-app/` (1), `site/`
(2), `supabase/` (5's schema), `docs/`.

## 4. The data model

```
   OPERATOR  (the company that runs fields — "Milton Sports Dome Inc.")
      │ owns one or more
      ▼
   VENUE  (a physical place with an address + map pin — "Milton Soccer Dome")
      │ contains one or more
      ▼
   FIELD  (a single bookable pitch — "Indoor Turf 5-a-side, $120/hr")
```

Plus tables for **users**, **reviews**, **saved venues**, and a few more. Two
properties show up everywhere:

- **`is_active` — the master visibility switch.** Every venue and field has an
  on/off flag. The database only lets the public read rows where it's ON.
  Hiding a junk listing is one flag flip — instant, reversible (we never
  delete), and obeyed by the app, map, search, and website at once.
- **RLS (Row-Level Security) — the guard at the door.** A rule enforced *by the
  database* about who can read/change which rows: anyone reads active venues;
  you read/edit only *your own* saves and reviews. Because the database enforces
  it, the API and website can use a **low-privilege "anon" key** and still be
  safe — the database itself refuses to leak private data. Only the scrapers use
  the powerful **service-role key** (which bypasses RLS) to write.

---

# Part II — The decisions (and the alternatives)

Each decision below follows the same shape: **what we chose**, **what else was
considered**, **why this won**, and **the tradeoffs we accepted**. None of these
are "best in the abstract" — they're best *for a pre-revenue, read-heavy
discovery app that has to be cheap to run and fast to change.*

## Data & domain

### D1 — Managed Postgres (Supabase) as the single source of truth

**Chosen:** Supabase — hosted PostgreSQL that also bundles authentication,
auto-generated REST, row-level security, and type generation.

**Alternatives considered:**
- **Self-hosted Postgres** (on a VPS or RDS).
- **Firebase / Firestore** (Google's NoSQL document store).
- **PlanetScale / MySQL**, or **DynamoDB** (NoSQL key-value).
- **Airtable / a spreadsheet** as a quick MVP backing store.

**Why this won:** The domain is deeply *relational* (operator → venue → field,
plus users/reviews/saves) and needs **geographic queries** — both of which
relational Postgres + PostGIS do natively and NoSQL stores fight you on. On top
of that, Supabase hands us four things for free that we'd otherwise build and
operate ourselves: **auth**, **row-level security** (auth enforced at the data
layer — see D3/D5), **type generation** into TypeScript, and a generous free
tier. One vendor covers database + login + storage, which is exactly right for a
tiny team.

**Tradeoffs accepted:** Vendor lock-in to Supabase's conventions (RLS policies,
PostgREST quirks, the supabase-js client). The free tier can cold-start and adds
latency. We have less control than a self-hosted box. And we adopt features we
don't use (Realtime), which we have to explicitly opt out of in the client.

### D2 — PostGIS for "fields near me"

**Chosen:** PostGIS (the geo extension for Postgres) with a GIST spatial index,
queried through database functions (`venues_within`, `search_fields`).

**Alternatives considered:**
- **App-side distance math** (pull rows, compute haversine in JS).
- **A dedicated search service** — Elasticsearch, Algolia Places, Typesense.
- **Bounding-box-only SQL** (cheap `WHERE lat/lng BETWEEN …`, no true radius).

**Why this won:** "Venues within X km, sorted by distance, filtered by
surface/size/price, paginated" is the app's hottest query — and PostGIS answers
it as **one indexed SQL statement** living right next to the data. App-side math
doesn't scale (you'd fetch everything every time). A separate search service is
real power but real operational weight and a second copy of the data to keep in
sync — overkill for thousands of venues.

**Tradeoffs accepted:** We're tied to Postgres/PostGIS. Geo queries are heavier
than plain key lookups (which is exactly why D7 caches them). And to keep
distance-ordering correct through pagination, the proximity path runs **two
queries** — the function returns an ordered set of IDs, then we hydrate that
page's venues and re-apply the order.

### D3 — Soft delete everywhere: "collect wide, show narrow"

**Chosen:** Nothing is ever hard-deleted. The scrapers over-collect; a cleanup
pass flips `is_active` OFF on the junk. RLS hides inactive rows from the public.

**Alternatives considered:** Hard `DELETE`s; a separate `hidden` table; a
multi-value status column.

**Why this won:** Scraping is noisy — one Google run pulled ~300 places, of
which only ~125 were real bookable fields. Cleanup **must be reversible** (we
get it wrong sometimes), and a single boolean read by RLS controls visibility
across every surface at once.

**Tradeoffs accepted:** Dead rows accumulate forever, and *every* public query
has to remember to filter `is_active` (handled centrally in RLS + the query
layer, but it's a rule you can't forget).

## API & access

### D4 — A dedicated read API (Fastify) in front of the database

**Chosen:** A small, long-running Fastify server (`apps/api`) that the app calls
for venue/field/search reads. It runs TypeScript directly via `tsx` (no build
step), and is **stateless**.

**Alternatives considered:**
- **No API at all** — let the app talk straight to Supabase/PostgREST for
  everything (Supabase generates a REST API automatically).
- **Serverless functions** — Vercel / AWS Lambda / Supabase Edge Functions.
- **GraphQL** — Hasura or Apollo over Postgres.

**Why this won:** A server in the middle earns its place by giving us four
things PostGIS-direct can't: a place to **cache** (D7), a place to **compose
multi-step queries** (the proximity hydrate, the search RPC), a **stable, minimal
API contract** for the app that doesn't change every time the DB schema does,
and **rate-limiting + a single audited query surface**. Fastify specifically:
it's fast, low-overhead, first-class TypeScript, and has the plugins we want
(helmet, CORS, rate-limit). A **long-lived process** (vs. serverless) keeps
database and Redis connections warm. GraphQL solves a query-flexibility problem
we don't have — our read patterns are few and fixed.

**Tradeoffs accepted:** It's one more thing to deploy, monitor, and keep up. We
hand-write endpoints that PostgREST would have generated for free. For the
simplest reads, it's arguably a layer we could skip — we keep it because caching
and contract stability matter more than saving the layer.

### D5 — Clients talk straight to Supabase for auth + their own data (the hybrid)

**Chosen:** Public/heavy reads go through the cached API (D4); **login and a
user's own rows** (saved venues, reviews, profile) go **directly** from the app
to Supabase, secured by RLS. The website likewise reads venues straight from
Supabase at build time.

**Alternatives considered:** Route *everything*, including auth and user writes,
through our own API server.

**Why this won:** Supabase Auth + RLS already secure per-user reads and writes
correctly. Proxying them through our API would mean **re-implementing auth,
adding a network hop, and gaining nothing** — the database is already the
gatekeeper for private rows. So we split by need: the API handles what benefits
from caching and query composition; Supabase handles identity and
already-secured personal data.

**Tradeoffs accepted:** There are **two data paths** to understand, and business
logic lives in two places (our API code *and* RLS policies). The app depends
directly on the supabase-js SDK, not just on our API contract.

### D6 — Stateless server with *permissive* auth

**Chosen:** The API keeps no session state and uses a **permissive** JWT check:
if a valid login token is present it attaches the user to the request; if not,
the request proceeds anyway as a guest.

**Alternatives considered:** A server-side session store; a strict auth gate
that rejects unauthenticated requests on every route.

**Why this won:** Discovery is **public** — guests must browse without an
account. A permissive check lets the same endpoints serve guests and logged-in
users, and statelessness means we can run many copies and **auto-stop to zero**
when idle (D8).

**Tradeoffs accepted:** Each route that *does* need a user must check `req.user`
itself and return 401 explicitly. And verifying a token calls Supabase per
request — acceptable, because the cached public paths dominate traffic.

## Caching

### D7 — A best-effort Redis read-through cache

**Chosen:** Redis (Upstash, via Fly) wrapping the expensive read paths.
Search results cache for 30s; proximity and venue-detail for 60s. The cache is
**fail-soft**: if Redis is down or returns garbage, the code silently falls
through to the live query.

**Alternatives considered:**
- **No cache** — hit Postgres every time.
- **In-process memory (LRU)** inside the API.
- **HTTP/CDN caching only** (cache-control headers, no Redis).

**Why this won:** The PostGIS searches are the costly path *and* they repeat
constantly — a user panning the map fires the same nearby-search again and
again. Short TTLs absorb those bursts cheaply while keeping data fresh enough
for discovery. An in-process cache wouldn't be **shared across instances** and
would vanish every time the server scales to zero. (We *also* send HTTP
cache-control headers — the two layers complement each other.)

**Tradeoffs accepted:** Another managed service. Data is **stale within the TTL
window** (bounded, and fine for discovery). And the cache key is load-bearing —
it hashes *normalized* parameters (rounded coordinates, sorted filter arrays) so
that trivially-different requests share an entry; get that wrong and the hit
rate collapses.

## Hosting

### D8 — Fly.io for the API

**Chosen:** The API container runs on Fly.io in the Toronto region (`yyz`), set
to **auto-stop to zero** machines when idle and wake on the next request.

**Alternatives considered:**
- **Serverless** (Vercel functions / AWS Lambda).
- **Render / Railway** (similar PaaS).
- **AWS ECS/Fargate** or a **plain VPS**.

**Why this won:** A **long-lived process** keeps database and Redis connections
warm — the opposite of per-invocation serverless, which reconnects constantly
and fights connection limits. Fly is **Docker-native**, lets us run **right next
to the users and Supabase** (low latency), and **scales to zero** so an idle
pre-revenue app costs almost nothing. Deploys are a single `flyctl deploy`.

**Tradeoffs accepted:** Scaling to zero means a **cold start** — the first
request after an idle period is slow. We manage a container image (vs. fully
hands-off functions). And deployment is currently **manual** (there's a
`fly-deploy.yml` draft, intentionally not committed, so a push doesn't silently
deploy) — `cd apps/api && flyctl deploy`.

### D9 — Next.js static site on Vercel

**Chosen:** A Next.js site that **pre-builds one HTML page per venue** (Static
Site Generation) from the same Supabase data, served from Vercel's CDN.

**Alternatives considered:**
- **Server-rendered (SSR)** pages built on each request.
- **Plain hand-written HTML.**
- **A CMS** (WordPress / Webflow).
- **Serving marketing from the app or API** itself.

**Why this won:** **SEO is the growth engine.** Hundreds of pre-rendered venue
pages ("indoor soccer Mississauga") are instant, crawlable, and served globally
from a CDN with **zero runtime database load** — they're built once. SSR would
add a server and per-request DB cost for content that barely changes. A CMS
would split the venue data away from the single source of truth.

**Tradeoffs accepted:** Pages are **only as fresh as the last build** — new or
changed venues need a rebuild to appear. Build time grows with the venue count.
And it's another vendor (Vercel) in the mix.

## Clients

### D10 — Expo / React Native for the mobile app

**Chosen:** One TypeScript codebase on Expo / React Native, shipped to the App
Store via Expo's EAS service, with **over-the-air (OTA) updates** for small
changes.

**Alternatives considered:**
- **Native Swift / SwiftUI** (iOS-only, hand-built).
- **Flutter** (Dart, cross-platform).
- **A PWA / responsive website** instead of a native app.

**Why this won:** It shares one language (TypeScript) with the entire rest of
the stack, iterates fast, and supports **OTA updates** — we can push text,
layout, and bug fixes straight to phones without waiting on App Store review.
The ecosystem (maps, bottom sheets, navigation) is deep, and EAS handles
build/submit. It's iOS-first today but **Android-ready** with the same code.

**Tradeoffs accepted:** There's a framework layer between us and native APIs, so
heavy map interactions aren't as buttery as hand-tuned native, and occasional
native-module friction appears. App size is larger than a pure-native build.

### D11 — Local-first app state, with optional cloud sync

**Chosen:** Saves, recently-viewed, and preferences are written **on-device
first** (AsyncStorage) for instant, offline, signed-out use; when you're signed
in, they **also sync** to Supabase so they follow you across devices.

**Alternatives considered:** **Server-authoritative** state (every save is an
API round-trip); or **pure local** with no cloud sync at all.

**Why this won:** Tapping "save" must feel **instant** and work offline and
*before* you have an account — server-authoritative can't. Cloud sync then
layers on for signed-in continuity. Optimistic, eventually-consistent behaviour
is exactly right for low-stakes discovery data.

**Tradeoffs accepted:** Sign-in needs **merge logic** (union the local set with
the cloud set). There's a brief window where local and cloud can diverge. And
the per-feature provider scaffolding is repetitive — a known cleanup we've
deliberately deferred until it's worth abstracting.

## Ingestion

### D12 — Scraping as a scheduled GitHub Action, not a live service

**Chosen:** The scrapers run as a **weekly GitHub Actions job** (plus manual
trigger), upserting on a stable `external_id` so re-runs never create
duplicates, in two phases: **collect wide**, then **clean up** (D3).

**Alternatives considered:** A **Fly cron machine**; a **dedicated worker +
queue**; buying data from a **third-party provider**; **on-demand** scraping
when a user searches.

**Why this won:** Field data changes **slowly** — weekly is plenty. Idempotent
upserts make re-running completely safe. GitHub Actions is **free**, already
where CI lives, already holds the secrets, and supports manual dispatch. Standing
up always-on infrastructure for an occasional batch job would be waste.

**Tradeoffs accepted:** Data can lag reality by up to a week. GitHub Actions
isn't designed for very long, heavy jobs (fine at current scale; revisit if
sources multiply). And ingestion is coupled to GitHub as a platform.

## Repository

### D13 — One repo, `apps/` layout, no workspace tooling (yet)

**Chosen:** A single monorepo. Deployable services live under `apps/`
(`apps/api` today); the self-contained clients (`fieldstack-app`, `site`) and
shared infra (`supabase`, `docs`) sit alongside. **No** Nx/Turborepo/workspaces.

**Alternatives considered:** **Separate repos** per project; or a **managed
monorepo** with workspace tooling and shared packages.

**Why this won:** A small team benefits from shared context, **atomic
cross-cutting changes**, and one place for issues and CI. The `apps/` convention
**leaves a labelled home for the next service** (e.g. booking) so growth needs
no second reorg — but workspace tooling and shared packages are deferred under
**YAGNI**: there's no shared code yet that earns them.

**Tradeoffs accepted:** Each project keeps its **own dependencies and lockfile**
(no single install), domain **types are duplicated** across the API, app, and
site today, and CI must scope each job to its project directory.

### D14 — Bun for dev/test, npm for the prod image, `tsx` for running TS

**Chosen:** **Bun** runs local dev, tests, and CI (fast). The **production
Docker image uses `npm ci` against the committed `package-lock.json`** (a
well-trodden, reproducible path). Both dev and prod run TypeScript **directly via
`tsx`** — there's no separate compile/bundle step.

**Alternatives considered:** Bun everywhere (incl. the prod image); a
**compiled** build step (tsc/esbuild → JS) for production.

**Why this won:** Bun makes the inner loop and CI quick; npm + a lockfile makes
the production image boringly reproducible; `tsx` removes an entire build
pipeline to maintain for a server this size.

**Tradeoffs accepted:** **Two package managers** to keep coherent — so
`package-lock.json` is the source of truth and **`bun.lock` is deliberately not
committed** (committing it has broken CI). `tsx` carries a small runtime cost
versus precompiled JavaScript.

---

# Part III — Limits and growth

## What this architecture is deliberately *bad* at

Being honest about the edges is the point of an architecture doc. These aren't
oversights — they're the cost side of the decisions above.

- **Real-time anything.** No live availability, no "2 spots left," no push the
  instant a price changes. Supabase Realtime is intentionally unused. (Cost of
  D1/D7's caching + discovery framing.)
- **Transactions and money.** No payments, no holding a slot while you pay, no
  inventory. The "booking" is a **redirect** to the operator. Adding real
  transactions would violate the read-heavy, stale-tolerant assumptions
  baked in throughout.
- **Strong freshness.** Data is bounded-stale by design: up to the cache TTL
  (seconds) for live reads, up to the scrape cadence (a week) for new fields,
  and up to the last build for website pages.
- **Multi-region writes.** A single Supabase primary. Reads are fast and
  cacheable; we are not built for globally-distributed writes.
- **Idle latency.** Fly scale-to-zero and the Supabase free tier both **cold
  start** — the first request after quiet is slow. A money-saving trade for a
  pre-revenue app.

If Onside were a booking *transactor*, almost every one of these would have to
flip — which is precisely why it isn't one today.

## How it grows (and what changes)

| When this happens | What changes | Why it's already easy |
|---|---|---|
| Expand to more cities | Edit a config file of cities | Nothing is hard-wired to Toronto |
| Real booking / payments | A **new `apps/booking/` service** with stronger consistency, payments, and **no best-effort caching** | The `apps/` layout (D13) was chosen for exactly this; `buildBookingUrl` is the seam kept for it |
| 2+ services share API types | Introduce `packages/contract/` + a workspace | D13 reserves the slot; add tooling only when it pays rent |
| Read traffic climbs | Longer cache TTLs, a Postgres read replica, or push hot paths to the edge | The cache + stateless API (D6/D7) already make this incremental |
| Android | Build the existing Expo app for Android | One codebase, already cross-platform (D10) |

The throughline: today's design optimizes for **cheap, fast, read-heavy
discovery that's easy to change.** Each growth step above is *additive* — it
slots into a seam we left open, rather than forcing a rewrite.

---

## Where to look in the code

| To understand… | Open… |
|----------------|-------|
| The API server and its routes | `apps/api/src/index.ts`, `apps/api/src/routes/` |
| How the API reads data + caches it | `apps/api/src/lib/queries/`, `apps/api/src/lib/cache.ts` |
| Auth verification on the API | `apps/api/src/lib/verifyJWT.ts` |
| The database structure (tables, rules, RPCs) | `supabase/migrations/` |
| The app's screens and navigation | `fieldstack-app/src/screens/`, `fieldstack-app/src/navigation/` |
| How the app calls the API | `fieldstack-app/src/api/`, `fieldstack-app/src/hooks/` |
| Local-first state + cloud sync | `fieldstack-app/src/lib/savedVenues.tsx`, `recentlyViewed.tsx` |
| The website's venue pages | `site/app/venues/`, `site/lib/venues.ts` |
| The scraping + clean-up scripts | `apps/api/scripts/scrape/run.ts`, `apps/api/scripts/scrape/refine.ts`, `apps/api/scripts/scrape/sources/` |
| Deploying the backend / building the app | `docs/deploy-backend.md` |
| Booking-integration strategy | `docs/scraping.md` |

---

## Glossary

| Term | What it means |
|------|---------------|
| **anon key** | The low-privilege Supabase API key used by the API server and website. With RLS on, it can only read public/active rows — safe to use in code that handles untrusted requests. |
| **API / API server** | The Fastify gatekeeper program that answers the app's venue-data requests and talks to the database. |
| **AsyncStorage** | The phone's small on-device key-value store, where the app keeps saves/preferences locally (D11). |
| **Cache** | A fast temporary store (Redis) of recent answers, so we don't re-ask the database for the same thing (D7). |
| **CDN** | Content Delivery Network — worldwide servers that serve the website's pre-built pages quickly. |
| **CI** | Continuous Integration — automated checks (types, tests, secret scans) on every code change. |
| **cold start** | The slow first request after a service has been idle and scaled down. |
| **EAS** | Expo Application Services — builds and submits the app to the App Store, and ships OTA updates. |
| **Fastify** | The web framework the API server is built with. |
| **Fly.io** | The host the API server runs on, in Toronto, scaled to zero when idle (D8). |
| **GTA** | Greater Toronto Area — the region Onside covers. |
| **idempotent / upsert** | A write that's safe to repeat: re-running the scraper updates existing rows instead of duplicating them (D12). |
| **`is_active`** | The on/off visibility flag on venues/fields; the public only sees ON rows (D3). |
| **JWT** | JSON Web Token — the signed "ID badge" the app gets at login and shows the API to prove who you are. |
| **monorepo** | One git repository holding all the projects (D13). |
| **Next.js** | The framework the website is built with. |
| **OSM (OpenStreetMap)** | A free public world map; a scraping source for outdoor fields. |
| **OTA** | Over-The-Air update — pushing small app changes straight to phones without App Store review. |
| **PostGIS** | The Postgres extension that does map math ("venues within 10 km") (D2). |
| **Postgres** | The relational database we use, hosted by Supabase. |
| **PostgREST** | Supabase's auto-generated REST API over Postgres — the "client-direct" path the app uses for auth/own-data (D5). |
| **read-through cache** | Cache pattern: check cache → on miss, run the query and store the result (D7). |
| **RLS (Row-Level Security)** | Database-enforced rules about who can read/change which rows — the reason the anon key is safe (D1/D5). |
| **RPC** | Remote Procedure Call — here, a function that runs *inside* Postgres (e.g. `venues_within`) that the API calls. |
| **Scraping** | Automatically collecting field data from public sources to fill the database (D12). |
| **SEO** | Search Engine Optimization — getting venue pages to show up on Google (the point of D9). |
| **service-role key** | The powerful Supabase key that **bypasses RLS**; used *only* by the scrapers to write data. |
| **SSG (Static Site Generation)** | Building all website pages ahead of time so visitors get instant, pre-made pages (D9). |
| **stateless** | The API remembers nothing between requests, so it can run many copies and scale to zero (D6/D8). |
| **Supabase** | The service hosting our Postgres database, auth, and RLS (D1). |
| **`tsx`** | A tool that runs TypeScript directly, with no separate build step (D14). |
| **TTL** | Time To Live — how long a cached answer stays valid before it's re-fetched (D7). |
| **Upstash** | The managed Redis provider behind the cache. |
| **Vercel** | The host the website runs on. |
| **YAGNI** | "You Aren't Gonna Need It" — don't build for a future you don't have yet (the restraint behind D13). |
