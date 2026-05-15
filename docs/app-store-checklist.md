# App Store submission checklist

Single source of truth for everything you need to ship FieldStack to the App
Store (and Play Store, where the parallel applies). Anything you produce
during prep goes in `fieldstack-app/assets/store/` so it's versioned with the
code.

---

## 1. Code-side prerequisites (mostly done)

- [x] App icon (`fieldstack-app/assets/images/icon.png`, 1024×1024)
- [x] Splash screen (`fieldstack-app/assets/images/splash-icon.png`)
- [x] Bundle ID / scheme set in `app.json` (`fieldstackapp`)
- [x] Privacy manifest declared in `app.json` (PR 27)
- [x] Privacy strings in `infoPlist` (Location, Calendar, Tracking)
- [x] Notification permission declared via `expo-notifications` plugin
- [x] Sentry crash reporting wired (PR 24)
- [ ] Versioning bumped: `app.json` `version` + iOS `buildNumber` for each TestFlight upload
- [ ] EAS Build profile (`eas.json`) configured for production
- [ ] Apple Developer Program enrollment ($99/yr)

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
- [ ] **iPad Pro (12.9", 6th gen)**: 2064×2752 — *required only if app supports iPad*

We support iPad (`supportsTablet: true`), so include iPad screenshots.

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
privacy manifest. Walk through these answers:

| Data category | Collected? | Linked to user? | Tracking? | Purpose |
|---|---|---|---|---|
| Email | Yes | Yes | No | App functionality (auth) |
| Precise Location | Yes | No | No | App functionality (distance ranking) |
| Crash data | Yes | No | No | App functionality (Sentry) |
| Performance data | Yes | No | No | Analytics (PostHog) |
| Product interaction | Yes | No | No | Analytics (PostHog) |

If/when we add Apple/Google sign-in or push tokens, add User ID + Device ID rows.

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
