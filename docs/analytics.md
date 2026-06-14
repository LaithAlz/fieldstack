# Analytics — events & PostHog dashboards

What the app emits and the insights to build for tracking user movement,
activation, and churn. Events flow through `src/lib/analytics.ts` → the
PostHog provider (active once `EXPO_PUBLIC_POSTHOG_KEY` is set; see
`docs/releasing.md` / `.env.example`). Every event is attributed to the
signed-in user via `identify(user.id)`; guests are anonymous until they sign
in, at which point PostHog merges the anonymous history into the person.

---

## Event reference

| Event | When | Key properties |
|---|---|---|
| `app_opened` | Cold launch | — |
| `app_foregrounded` | Return from background | `away_seconds`, `new_session`, `last_screen` |
| `app_backgrounded` | Leaves the app (the **exit** point) | `session_seconds`, `last_screen`, `screens_viewed` |
| `screen_viewed` | Every navigation transition | `screen`, `previous_screen`, `session_seconds` |
| `search_filtered` | A field search runs (debounced, user-driven) | `sort`, `has_location`, optional `surface`/`size`/`venue_type`/`price_max`/`radius_km` |
| `venue_viewed` | Venue detail opens | `venue_id` |
| `field_viewed` | Field detail opens | `field_id` |
| `booking_cta_tapped` | Taps "Book on operator's site" | `field_id`, `venue_id`, `operator_id` |
| `booking_redirect_confirmed` | Redirect to operator actually opens | `field_id`, `venue_id`, `operator_id` |

PostHog also auto-captures `Application Opened/Backgrounded/Installed/Updated`
(`captureAppLifecycleEvents`). Those overlap with `app_opened`/`app_backgrounded`
— prefer our custom ones in insights since they carry the extra context.

### `screen` / `last_screen` values
Route names from the navigator: `VenueList` (Explore), `MapView`, `FieldSearch`,
`VenueDetail`, `FieldDetail`, `SavedList`, `Profile`, `Settings`, `SignIn`,
`SetNewPassword`, `Welcome`.

---

## Dashboards to build

Create a dashboard named **"Movement & retention"** and add these insights
(PostHog → Product analytics → New insight; pin each to the dashboard).

### 1. Activation funnel
Insight type **Funnel**. Steps, in order:
1. `app_opened`
2. `screen_viewed` where `screen = VenueDetail`
3. `booking_cta_tapped`
4. `booking_redirect_confirmed`

Conversion window 1 day. This is the core "browse → intent → handoff" funnel;
the biggest step-to-step drop is where to focus product work.

### 2. Retention
Insight type **Retention**. Returning event `app_opened`, performed event
`app_opened`, **Weekly**, last 8 weeks. This is the headline "do people come
back" view — true churn is the far-right columns trending to zero.

### 3. Churn by exit screen
Insight type **Trends**. Event `app_backgrounded`, **Break down by**
`last_screen`. Shows which screen users most often leave from. A spike on a
non-terminal screen (e.g. `FieldSearch`) is a friction signal; leaving from
`booking_redirect_confirmed`'s screen is healthy (they went to book).

### 4. Screen flow / paths
Insight type **Paths**. Start at `app_opened`; event type `screen_viewed`
(PostHog uses the `screen` property as the path step via a custom event path,
or use the dedicated Paths "custom events" mode). Reveals the common routes
through the app and the dead-ends.

### 5. Session depth & length
Insight type **Trends**, two series on `app_backgrounded`:
- average of `screens_viewed` (how much they explore per session)
- average of `session_seconds` (how long they stay)
Trend them weekly; rising = stickier.

### 6. Search engagement
Insight type **Trends**. Event `search_filtered`, count + **break down by**
`has_location`, and a second insight broken down by `surface` / `size` to see
which filters people actually use (informs which to surface vs. bury).

---

## Useful segments

- **New vs returning**: filter any insight by `app_foregrounded.new_session`
  or use PostHog cohorts on first-seen date.
- **Signed-in vs guest**: cohort on whether the person has an identified
  `email` property (set at `identify`).
- **Bookers**: cohort of users who fired `booking_redirect_confirmed` — your
  most valuable segment; compare their retention vs. everyone.

---

## Notes

- EU PostHog projects: set `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`.
- Events are batched and flushed by the SDK; expect a short delay before they
  appear in the live Activity view.
- To verify wiring end-to-end after setting the key: open the app, then watch
  PostHog → Activity for `app_opened` and `screen_viewed`.
