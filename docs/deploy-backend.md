# Deploying the backend (Fly.io) + building the app (EAS)

Two things to ship before `api.getonside.ca` works and the app is on the
store: the **Fastify API on Fly.io**, and the **iOS build via EAS**.

---

## 1. Backend → Fly.io

The API is containerized (`apps/api/Dockerfile`) and configured in
`apps/api/fly.toml`. It runs the TypeScript entry with `tsx` and listens on
port 3000. All `fly` commands below run from `apps/api/` (that's where
`fly.toml` lives, so flyctl picks up the app name automatically).

### One-time

```sh
cd apps/api                  # fly.toml + Dockerfile live here
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login
fly launch --no-deploy       # detects fly.toml + Dockerfile; pick the app name
                             # (default "onside-api") and region (yyz)
```

### Secrets

These are NOT in the repo. Set them on Fly (they become env vars):

```sh
fly secrets set \
  SUPABASE_URL="https://hjvaoshvvjfygfeuzrfh.supabase.co" \
  SUPABASE_ANON_KEY="<the anon key from fieldstack-app/.env>"
```

`ALLOWED_ORIGINS` can stay unset — the mobile app doesn't send an Origin, so
CORS stays closed to browsers, which is what we want. `TRUST_PROXY=true` and
`NODE_ENV=production` are already in `fly.toml`.

### Redis (cache — optional but recommended)

The cache is best-effort (the API works without it; `/health` reports Redis as
degraded, not failed). To enable it, provision Upstash Redis through Fly and
point the app at it:

```sh
fly redis create                       # follow prompts; copy the rediss:// URL
fly secrets set REDIS_URL="rediss://…"  # ioredis enables TLS from the scheme
```

### Deploy

```sh
fly deploy
fly open /health     # expect {"data":{"supabase":"ok","redis":"ok"|"error"}}
```

### Custom domain — `api.getonside.ca`

```sh
fly certs add api.getonside.ca
fly ips list          # note the v4 (A) and v6 (AAAA) addresses
```

Then in **Vercel → Domains → getonside.ca → DNS**, add:
- `A`  `api` → the Fly v4 IP
- `AAAA` `api` → the Fly v6 IP

(Or a `CNAME api → <app>.fly.dev` if you prefer.) Once DNS propagates,
`fly certs show api.getonside.ca` will go green and the app's production
`EXPO_PUBLIC_API_URL=https://api.getonside.ca` resolves.

### Updating later

`fly deploy` from `apps/api/` rebuilds and ships. The image only contains the
server (`src/`, `types/`, configs) — see `apps/api/.dockerignore`.

---

## 2. App → EAS build & submit

`eas.json` is configured (production profile, remote versioning, channel,
env). These commands need your Expo + Apple logins, so run them yourself.

```sh
cd fieldstack-app
npm i -g eas-cli
eas login
eas init                 # links/creates the EAS project (writes projectId) if not done
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Before building, make sure:
- `api.getonside.ca` is live (above) — the production build points at it.
- The real `EXPO_PUBLIC_POSTHOG_KEY` is in `eas.json`'s production env (not the
  placeholder).
- Sign in with Apple is configured in Supabase if you want that button working
  in review (otherwise it shows "isn't available yet").

Builds auto-increment the build number (`appVersionSource: remote`). Bump
`expo.version` by hand for a user-facing version change.

OTA updates after launch: see `docs/releasing.md`.
