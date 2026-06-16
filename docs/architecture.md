# Onside — How the Whole System Works

This document explains the entire Onside system in plain language. No prior
knowledge assumed. Every technical term is spelled out the first time it
appears, and there's a full **[glossary](#glossary)** at the bottom.

All the diagrams here are drawn in plain text, so they show up correctly
anywhere — GitHub, a code editor, a terminal, anywhere.

---

## 1. What Onside is, in one sentence

**Onside helps people find a soccer field to play on in the Toronto area, and
sends them to that field's own website to book it.**

Think of it like a "Google Maps for soccer fields": we keep a clean, complete
list of every field in the region, show it on a map with prices and details,
and when you want to play, we hand you off to the place that actually takes the
booking. Onside itself doesn't take your money or your reservation — it's the
discovery layer.

---

## 2. The five parts (the cast of characters)

The whole system is made of **five pieces**. Four of them are things people or
robots interact with; the fifth is the database in the middle that ties
everything together.

| # | Part | In plain words | Built with |
|---|------|----------------|------------|
| 1 | **Mobile app** | The iPhone app players actually use. | Expo / React Native |
| 2 | **Website** (getonside.ca) | Pages on the web that advertise the app and show every venue (so Google can find them). | Next.js |
| 3 | **API server** | A program that the app phones up to ask "give me the fields near me." It fetches the answer from the database. | Fastify |
| 4 | **Scraping scripts** | Robots that go out, find new soccer fields online, and add them to the database. | TypeScript scripts |
| 5 | **The database** | The single place where every field, venue, user, and review is stored. Everything else reads from or writes to it. | Supabase (a hosted Postgres database) |

> **Why a separate API server AND a database?** The database just stores data.
> The API server is the *gatekeeper* in front of it: it checks requests, adds
> caching so things are fast, and only ever hands out data that's allowed to be
> public. The phone app talks to the API server, not straight to the raw
> database (except for login — more on that later).

---

## 3. The whole system at a glance

Here's how the five parts connect. Arrows show "who talks to whom."

```
        PEOPLE                          ROBOTS (run on a schedule)
   ┌──────────────┐  ┌──────────────┐   ┌────────────────────────┐
   │ Player on     │  │ Visitor in    │   │  Scraping scripts       │
   │ iPhone        │  │ a web browser │   │  (find new fields)      │
   └──────┬───────┘  └──────┬───────┘   └───────────┬────────────┘
          │                 │                        │
          ▼                 ▼                        │ adds + cleans
   ┌──────────────┐  ┌──────────────┐                │ field listings
   │ MOBILE APP    │  │ WEBSITE       │                │
   │ (1)           │  │ getonside.ca  │                │
   └──────┬───────┘  │ (2)           │                │
          │          └──────┬───────┘                │
          │ "fields near me?"│                        │
          ▼                 │ reads venue data        │
   ┌──────────────┐         │ once, while the site    │
   │ API SERVER    │         │ is being built          │
   │ (3)           │         │                         │
   └──────┬───────┘         │                         │
          │                 │                         │
          ▼                 ▼                         ▼
   ┌───────────────────────────────────────────────────────────┐
   │                  THE DATABASE  (5)                          │
   │   Every venue, field, operator, user, and review is here.   │
   └───────────────────────────────────────────────────────────┘
```

The key idea: **the database in the middle is the single source of truth.**
The app and website only *read* from it. The only things that *write* new field
data are the scraping scripts. This keeps everything consistent — there's one
list of fields, and everyone sees the same one.

---

## 4. The database (the centre of everything)

The database holds a handful of related tables. The three that matter most:

```
   OPERATOR  (the company that runs a field — e.g. "Milton Sports Dome Inc.")
      │
      │ owns one or more
      ▼
   VENUE  (a physical place — e.g. "Milton Soccer Dome", with an address + map pin)
      │
      │ contains one or more
      ▼
   FIELD  (a single playable pitch — e.g. "Indoor Turf 5-a-side, $120/hr")
```

So: an **operator** runs one or more **venues**; each **venue** has one or more
**fields** you can actually book. There are also tables for **users**,
**reviews**, **saved venues**, and a few others.

Two things about the database are worth understanding because they come up
everywhere:

**(a) The "is it allowed to show" switch.**
Every venue and field has an on/off flag called `is_active`. The database is
configured so that the public can only ever read rows where this flag is ON.
That single switch controls visibility everywhere at once — the app, the map,
the search, and the website all respect it. To hide a junk listing, we just flip
the switch OFF (we never delete — so it can always be turned back on).

**(b) The "guard at the door" (called RLS).**
RLS = **Row-Level Security**. It's a rule, enforced by the database itself, that
decides which rows each person is allowed to see or change. For example: anyone
can read active venues, but you can only read or edit *your own* saved venues and
*your own* reviews. Because the database enforces this directly, the API server
can use a low-privilege key and still be safe — the database refuses to hand out
anything private.

---

## 5. Each part, explained

### Part 1 — The mobile app (the iPhone app)

This is the main product. It has three tabs at the bottom:

- **Explore** — browse fields as a list or on a live map, search and filter.
- **Saved** — the fields you've bookmarked.
- **Me** — your profile, settings, sign-in.

When the app needs data ("what fields are near me?"), it asks the **API server**
(Part 3). When you want to actually book, the app opens the field operator's own
website in your browser — Onside hands you off.

Login is the one exception: the app talks **directly** to the database's login
system (Supabase Auth), supporting email/password plus "Sign in with Google" and
"Sign in with Apple."

The app can also update itself *without* a full App Store review for small
changes (text, layout, bug fixes), using a feature called **OTA** (Over-The-Air
updates). Big changes still need a new App Store release.

### Part 2 — The website (getonside.ca)

Two jobs:

1. **Marketing** — convince visitors to download the app.
2. **Search visibility (SEO)** — this is the growth engine. SEO =
   **Search Engine Optimization**, i.e. getting found on Google. The website
   builds **one page for every single venue** (e.g. a page for "Milton Soccer
   Dome"). When someone googles "indoor soccer Milton," that page can show up,
   and they discover Onside.

Here's the clever part: those venue pages are built **ahead of time**, not when
a visitor arrives. When we publish the site, it reaches into the database once,
grabs all the venues, and writes out a finished HTML page for each one. Visitors
(and Google) then get plain, instant, pre-made pages. This "build it ahead of
time" approach is called **SSG** = **Static Site Generation**.

### Part 3 — The API server (the gatekeeper)

A small program whose only job is to answer the app's questions about venue
data, quickly and safely. For each request it:

1. Checks the request isn't abusive (rate-limiting: max 60 requests/minute).
2. Notes who's asking, if they're logged in (by checking their login token).
3. Looks up the answer — first in a fast temporary store (**cache**), and if it's
   not there, in the database.
4. Sends back the answer in a consistent format.

It's **stateless** (it remembers nothing between requests), which means we can
run many copies, and it can even shut down to zero when no one's using it (to
save money) and wake back up on the next request.

### Part 4 — The scraping scripts (how fields get into the system)

"Scraping" means automatically collecting information from public sources. These
scripts are how the database gets filled with fields. They pull from:

- **OpenStreetMap (OSM)** — a free, public map of the world; good for outdoor
  park pitches.
- **Google Places** — Google's directory of businesses; good for private indoor
  facilities (domes, futsal centres).
- **Manual list** — a hand-curated file for anything we want to add by hand.

The process has two steps:

1. **Collect** — cast a wide net and pull in everything that might be a soccer
   field. (One Google run found ~300 places.)
2. **Clean up** — a second script removes the junk: it merges duplicate listings
   of the same place, and switches off things that aren't really bookable fields
   (youth clubs, academies, sports-equipment shops). It never deletes — it just
   flips the `is_active` switch off, so anything can be restored. (This cut ~300
   raw results down to ~125 real, bookable facilities.)

These run on a **schedule** (weekly), not on every request.

---

## 6. How data flows — three walk-throughs

### Walk-through A: A player opens the map

```
  1. Player opens the Explore map in the app.
  2. App → API server:  "venues within 10 km of my location?"
  3. API server checks its fast cache.
       • If the answer's cached → returns it immediately.
       • If not → asks the database, which uses its map smarts (PostGIS) to
         find the nearest venues, then the API saves that answer in the cache
         for next time.
  4. API server → App:  the list of venues.
  5. App draws the pins on the map.
```

### Walk-through B: A new field gets discovered and cleaned

```
  1. Scraping script runs (weekly, or on demand).
  2. It searches Google/OpenStreetMap for soccer places across each GTA city.
  3. For each place found, it adds or updates a venue in the database.
       (It uses a unique ID per place, so re-running never makes duplicates.)
  4. The clean-up script runs: merges duplicates, switches off the non-fields.
  5. Result: the database now has the new real fields, switched ON; junk OFF.
  6. The app, map, and website all immediately reflect this — no code change.
```

### Walk-through C: The website gets published

```
  1. We publish a new version of the website.
  2. During the build, the site reads all active venues from the database once.
  3. It writes a finished web page for each venue, plus a sitemap (a list of all
     those page addresses that tells Google what to crawl).
  4. Those pre-made pages go live on getonside.ca.
  5. Google crawls them; people searching "indoor soccer <city>" find Onside.
```

---

## 7. Where everything runs (hosting)

Each part lives on a different service. None of this runs on a server we
physically own — it's all hosted.

| Part | Runs on | Address |
|------|---------|---------|
| Mobile app | Apple App Store (built/shipped via Expo's "EAS" service) | iPhone |
| Website | Vercel (a website host) | getonside.ca |
| API server | Fly.io (an app host), in a Toronto data centre | api.getonside.ca |
| Database + login | Supabase (hosted) | — |
| Scraping scripts | GitHub Actions (runs scripts on a schedule) | — |

Whenever we push new code, automated checks (**CI** = Continuous Integration)
run first — they type-check the code, run tests, and scan for accidentally
committed passwords — before anything goes live.

---

## 8. A few principles that hold it all together

- **One database, many readers, few writers.** Everyone reads the same data.
  Only you (your own rows) and the scrapers can write. This makes the system
  easy to reason about.
- **The `is_active` switch is the master control.** Hiding, cleaning, and
  un-hiding a listing is just flipping a flag — instant, reversible, and obeyed
  everywhere.
- **Collect wide, show narrow.** Scrapers grab everything; the clean-up step
  shows only confirmed real fields.
- **Nothing is hard-wired to Toronto.** The list of cities lives in a simple
  config file, so the exact same system can expand to other cities later.
- **Fail softly.** If the cache is down, or a setting is missing, the system
  degrades gracefully instead of crashing.

---

## 9. Where to look in the code

| To understand… | Open… |
|----------------|-------|
| The API server and its routes | `src/index.ts`, `src/routes/` |
| How the API reads data + caches it | `src/lib/queries/`, `src/lib/cache.ts` |
| The database structure (tables, rules) | `supabase/migrations/` |
| The app's screens and navigation | `fieldstack-app/src/screens/`, `fieldstack-app/src/navigation/` |
| How the app calls the API | `fieldstack-app/src/api/`, `fieldstack-app/src/hooks/` |
| The website's venue pages | `site/app/venues/`, `site/lib/venues.ts` |
| The scraping + clean-up scripts | `scripts/scrape/run.ts`, `scripts/scrape/refine.ts`, `scripts/scrape/sources/` |
| Strategy for connecting operator booking systems | `docs/scraping.md` |

---

## Glossary

Every term used in this doc, in plain language.

| Term | What it means |
|------|---------------|
| **API** | Application Programming Interface. A program (here, the "API server") that other programs call to get data. The app calls our API to get venue lists. |
| **API server** | Our gatekeeper program (built with Fastify) that answers the app's data requests and talks to the database. |
| **Cache** | A small, fast, temporary store of recent answers, so we don't re-ask the database for the same thing repeatedly. Here it's powered by Redis. |
| **CDN** | Content Delivery Network. A network of servers worldwide that serve the website's pre-made pages quickly to nearby visitors. |
| **CI** | Continuous Integration. Automated checks (tests, type-checks, security scans) that run on every code change before it goes live. |
| **Fastify** | The software framework the API server is built with. |
| **Field** | A single playable pitch inside a venue (e.g. "Indoor Turf, 5-a-side"). Has a size, surface, and price. |
| **Fly.io** | The hosting service the API server runs on. |
| **GTA** | Greater Toronto Area — the region Onside covers (Toronto, Mississauga, Brampton, etc.). |
| **`is_active`** | An on/off flag on each venue and field. Public users only see rows where it's ON. Flipping it off hides a listing everywhere, reversibly. |
| **JWT** | JSON Web Token. The little signed "ID badge" the app gets when you log in, and shows the API to prove who you are. |
| **Next.js** | The framework the website is built with. |
| **Operator** | The company/organization that runs a venue and takes the bookings. |
| **OSM (OpenStreetMap)** | A free, public, community-made map of the world. One of our sources for finding outdoor field locations. |
| **OTA** | Over-The-Air update. Pushing small app updates (text, layout, fixes) straight to phones without a full App Store review. |
| **PostGIS** | An add-on to the database that does map math — e.g. "find venues within 10 km of this point." |
| **Postgres** | The kind of database we use (a popular, reliable relational database). Supabase hosts it for us. |
| **RLS (Row-Level Security)** | A database rule that decides, row by row, who can read or change what. It's why the public can see active venues but only you can see your own saved list. |
| **RPC** | Remote Procedure Call. Here it means a function that runs *inside* the database (like the "find venues nearby" search) that the API calls directly. |
| **Scraping** | Automatically collecting information from public sources (Google, OpenStreetMap) to fill our database with fields. |
| **SEO** | Search Engine Optimization. Making our pages show up on Google when people search for soccer fields. |
| **SSG (Static Site Generation)** | Building all the website's pages *ahead of time* (when we publish), so visitors get instant, pre-made pages instead of pages assembled on the spot. |
| **Stateless** | The API server remembers nothing between requests, so we can run many copies and scale freely. |
| **Supabase** | The service that hosts our database, the login system, and the security rules. |
| **Venue** | A physical place with an address and a map pin (e.g. "Milton Soccer Dome"). Contains one or more fields. |
| **Vercel** | The hosting service the website runs on. |
