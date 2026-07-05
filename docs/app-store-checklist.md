# App Store submission checklist — Matchday resubmission

**Onside is already live** on the App Store (`id6780034337`). This is the
checklist for an *update* submission, not a first launch: the app shipped the
Matchday visual redesign plus the privacy-label and blocked-users fixes from
this batch, and needs a new build + submit to reach users. See section 8 for
exactly what this resubmission needs beyond what's already shipped.

Single source of truth for everything you need to ship an **Onside** update
to the App Store (and Play Store, where the parallel applies). Anything you
produce during prep goes in `fieldstack-app/assets/store/` so it's versioned
with the code. For the build/submit/OTA mechanics, see `docs/releasing.md`.

---

## 1. Code-side prerequisites (mostly done)

- [x] App icon (`fieldstack-app/assets/images/icon.png`, 1024×1024)
- [x] Splash screen (`fieldstack-app/assets/images/splash-icon.png`)
- [x] Bundle ID / scheme set in `app.json` (`app.onside.mobile` / `onside://`)
- [x] Privacy manifest declared in `app.json` (incl. UserID for auth)
- [x] Privacy strings in `infoPlist` (Location, Calendar) — deliberately **no**
      `NSUserTrackingUsageDescription`: we don't track, so there's no ATT
      prompt to declare
- [x] Notification permission declared via `expo-notifications` plugin
- [ ] Sentry crash reporting: wired in code (`@sentry/react-native` plugin +
      init), **DSN not configured** (user action — create a Sentry project
      and set `EXPO_PUBLIC_SENTRY_DSN`; see `docs/analytics.md` if that
      covers it, otherwise Sentry's Expo guide)
- [x] EAS Build profiles (`eas.json`) for development / preview / production
- [x] OTA updates wired (`expo-updates`, fingerprint runtimeVersion) — see `docs/releasing.md`
- [x] **Sign in with Apple** offered (required by 4.8 since we also offer Google)
- [x] **In-app account deletion** (Settings → Delete account → `delete_user` RPC) — required by 5.1.1(v)
- [x] **UGC moderation**: report review + block user + filtered display — required by 1.2 for reviews
- [x] **Blocked users are manageable**: Settings → Blocked users lists every
      blocked id with an Unblock action (`BlockedUsersScreen`, registered in
      `MainNavigator`'s `MeStackParamList`) — closes the gap where the block
      confirmation promised this and no screen existed
- [x] Run `eas update:configure` to populate `extra.eas.projectId` +
      `updates.url` — evidence: `fieldstack-app/app.json`'s `extra.eas.projectId`
      and `updates.url` are both populated with real values (not placeholders)
- [ ] Marketing version bumped (`app.json` `version`) for the release (build numbers auto-increment on EAS)
- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] Configure Google + Apple providers in Supabase (Auth → Providers) and
      add `onside://` to the redirect allow-list, or the social buttons report
      "isn't available yet" — **not evidenced as done**: `src/lib/socialAuth.ts`'s
      header comment still states neither provider works until this dashboard
      config exists, so this stays open (do not check off without confirming
      in the Supabase dashboard directly)

---

## 2. App Store Connect listing

### Required metadata
- [ ] **App name**: 30 chars max. e.g. "FieldStack: GTA Soccer Fields"
- [ ] **Subtitle**: 30 chars. e.g. "Find every soccer field in GTA"
- [ ] **Promotional text** (170 chars, editable any time without re-review)
- [ ] **Description** (4000 chars). Lead with what + why, then features as bullets.
- [ ] **Keywords** (100 chars total, comma-separated, no spaces between).
      Suggested: `soccer,gta,toronto,fields,turf,futsal,pitch,indoor,sportsplex,pickup`
- [ ] **Support URL** (e.g. `https://fieldstack.app/support` or a Notion page)
- [ ] **Marketing URL** (optional but boosts conversion)
- [ ] **Privacy policy URL** — *required* — must be live before submission

### App Review information
- [ ] **Demo account** for reviewers: pre-seeded email + password
- [ ] **Contact info**: your name, phone, email
- [ ] **Notes**: explain anything reviewers might miss (e.g. "Booking redirects to the operator's site — confirmed in test plan")

### Content rating
- [ ] Complete the Age Rating questionnaire. Soccer-field discovery is 4+.

---

## 3. Screenshots

Required sizes (Apple's "set-and-forget" workflow uses the largest only):

- [ ] **6.9" iPhone** (Pro Max size): 1320×2868 portrait — *required*
- [ ] **6.5" iPhone**: 1284×2778 — *required if 6.9" not provided*
- [ ] ~~iPad Pro (12.9", 6th gen): 2064×2752~~ — not required: `supportsTablet`
      is `false` in `app.json`, so the app isn't offered on iPad and no iPad
      screenshots are needed

We don't support iPad (`supportsTablet: false`), so skip iPad screenshots.

### Suggested screenshots (5 of these)
1. Explore venue list with location chip + filter chips
2. Map view with pins + carousel + "Search this area" pill
3. Venue detail with photo gallery + amenities
4. Booking time sheet with summary + suggestions row
5. Sign-up form (shows social proof of cloud sync)

### How to capture
- Run on a 6.9" sim (iPhone 16 Pro Max). `Cmd+S` saves to ~/Desktop.
- Trim status bar + home indicator with **Screenshot Framer** (free) or **Cleanshot**.
- Optionally overlay headlines with Figma / Sketch / Canva.

---

## 4. Privacy nutrition label

App Store Connect → App Privacy. Reflects what's in our `app.json`
`privacyManifests.NSPrivacyCollectedDataTypes`. Walk through these answers:

| Data category | Collected? | Linked to user? | Tracking? | Purpose |
|---|---|---|---|---|
| Email | Yes | Yes | No | App functionality (auth) |
| User ID | Yes | Yes | No | App functionality (auth — Supabase / Apple) |
| Precise Location | Yes | No | No | App functionality (distance ranking) |
| Crash data | Yes | No | No | App functionality (Sentry) |
| Performance data | Yes | No | No | Analytics (PostHog) |
| Product interaction | Yes | No | No | Analytics (PostHog) |
| Other usage data | Yes | **Yes** | No | App functionality (booking history + recently viewed venues) |
| Other user content | Yes | **Yes** | No | App functionality (saved venues + preferred play slot) |

The last two rows are new: the app now persists booking history, saved
venues, recently viewed venues, and a preferred play slot, all tied to the
signed-in account (linked = yes), never for tracking. Apple's nutrition-label
form doesn't have a bespoke type for each of those four fields, so they're
declared under the closest legitimate categories — "Other Usage Data" for the
two history-style records, "Other User Content" for the two user-authored
preferences — matching the `NSPrivacyCollectedDataTypeOtherUsageData` /
`NSPrivacyCollectedDataTypeOtherUserContent` entries in `app.json`. **This
table must be re-entered by hand in App Store Connect** — it isn't synced
automatically from `app.json`.

Note also: `identify()` calls into PostHog no longer pass the user's email
(see `src/lib/auth.tsx`) — only the id — so nothing here changed on the
"email" row, it just didn't grow a PostHog-linked duplicate.

If/when we add push tokens, add a Device ID row.

---

## 5. TestFlight pre-launch

- [ ] Internal testing build green (you only, 100 testers max, no review)
- [ ] External testing build green (up to 10,000 testers, Apple does a light beta review)
- [ ] Send invite to 5+ real users, gather a week of feedback
- [ ] Crash-free session rate ≥ 99% on Sentry over the beta window
- [ ] No `console.log` / `console.warn` spam in release logs

---

## 6. Submission

- [ ] Final binary uploaded via `eas submit --platform ios`
- [ ] Review notes mention: "Booking handoff is an external Linking redirect to operator-owned websites — by design."
- [ ] Submit for review. SLA is typically 24–48h.
- [ ] After approval, "Manually release this version" gives you the safe pattern:
      tick it once you've verified the production build is stable.

---

## 7. Play Store (parallel)

- [ ] App icon, screenshots (Google's specs differ slightly — 1080×1920 portrait works for most)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)
- [ ] Privacy policy URL (same one as iOS)
- [ ] Data safety form (mirror the iOS nutrition label answers)
- [ ] Content rating (IARC questionnaire)
- [ ] `eas submit --platform android` once you have a Google Play Console account ($25 one-time)

---

## 8. What THIS resubmission needs

Everything above is the general, reusable checklist. For this specific
update (Matchday redesign + the privacy/blocked-users fixes), the concrete
work is just:

- [ ] **Fresh 6.9" screenshots of the Matchday UI.** The suggested shots in
      section 3 predate the current sheet-over-map Explore rebuild (map +
      draggable bottom sheet, one screen instead of the old Explore / Map /
      Search trio) and the Matchday visual system (`design/tokens.json`).
      Recapture against the current build with `.maestro/screenshots.yaml`
      (requires a dev build, not Expo Go — see that file's header) or by hand
      on a 6.9" simulator.
- [ ] **Privacy-label update in App Store Connect** matching the new
      `app.json` rows from section 4 above: Other Usage Data (booking
      history, recently viewed venues) and Other User Content (saved venues,
      preferred play slot), both linked / not tracking / app functionality.
- [ ] **New EAS build + submit**: this is a native-manifest change
      (`app.json`'s `privacyManifests`), so it ships as a build, not an OTA
      update — `eas build --platform ios --profile production` then
      `eas submit --platform ios --profile production` (see
      `docs/releasing.md`).
