# FieldStack — Issues Master Document

This document is the single source of truth for the FieldStack frontend build. Every issue in this doc represents one GitHub issue. Hand this doc to Claude Code to bulk-create issues via the `gh` CLI.

**Phases:**
- **F0** — Cross-cutting standards (NOT individual issues — written to `docs/standards.md` instead)
- **F1** — Project setup
- **F2** — Venue list screen
- **F3** — Venue detail screen
- **F4** — Field search screen
- **F5** — Field detail + map view

**Labels:** `phase:f1` through `phase:f5`, `type:setup | type:screen | type:component | type:hook | type:foundation`, `priority:p1 | priority:p2`, `v2-deferred`

**Milestones:** F1, F2, F3, F4, F5

---

# F0 — Cross-cutting standards (write to docs/standards.md, not as issues)

These are not individual issues. They are project-wide standards that every issue references. Claude Code should write the contents of this section to `docs/standards.md` in the repo and link to it from every issue.

## REQ-F0.1 — Accessibility

Every component and screen must:
- Provide `accessibilityLabel` for icon-only buttons
- Provide `accessibilityRole` for interactive elements
- Maintain screen reader focus order matching visual order
- Maintain 4.5:1 contrast for body text, 3:1 for large text and UI elements
- Never convey meaning through color alone — use shape, icon, or text cues
- Support Dynamic Type without truncating critical content
- Disable non-essential animations when Reduce Motion is enabled
- Support full keyboard / external accessibility navigation where the platform allows

## REQ-F0.2 — Touch targets and spacing

- Minimum touch target: 44×44pt iOS, 48×48dp Android
- Minimum spacing between interactive elements: 8pt
- Use `hitSlop` to extend hit areas for visually small elements

## REQ-F0.3 — Loading, empty, and error states

- Skeleton placeholders during initial fetch (matching real content dimensions)
- Empty states with icon, message, and at least one suggested action
- Network error states with "Try again" button
- Persistent "You're offline" banner when device is offline
- Network timeouts: 10 seconds, no premature timeout before that

## REQ-F0.4 — Animation and feedback

- Pressed state visible within 80–150ms of every tap
- Micro-interactions 150–300ms with platform-native easing
- Light haptic on booking confirmation
- Selection haptic on filter chip toggle / date pick
- Respect Reduce Motion + system haptic settings

## REQ-F0.5 — Typography and color tokens

- All spacing, color, font size, font weight, border radius from `theme/tokens.ts`
- Zero hardcoded values in component code
- Base body text minimum 15pt
- Line-height minimum 1.5 for body text
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32
- Sentence case on all UI labels — no Title Case or ALL CAPS

## REQ-F0.6 — Analytics

- Single wrapper at `lib/analytics.ts` so provider can be swapped
- Events: `app_opened`, `venue_viewed`, `field_viewed`, `booking_cta_tapped`, `booking_redirect_confirmed`, `search_filtered`
- Each event includes relevant ids (venue_id, field_id, operator_id) and active filters where relevant

## REQ-F0.7 — Deep linking

- Custom URL scheme `fieldstack://`
- Universal link domain `fieldstack.app`
- Routes: `fieldstack://venues/:id`, `fieldstack://fields/:id`
- Not-found state for invalid IDs: "This field is no longer available" + "Back to home"

## REQ-F0.8 — Safe area and orientation

- Respect top and bottom safe area insets on every screen
- Keep CTAs clear of gesture bar and notch
- Portrait only in v1

## REQ-F0.9 — Light and dark mode

- Follow device color scheme automatically
- Define both light and dark token sets in `theme/tokens.ts`
- WCAG-compliant contrast in both modes
- Test every screen in both modes before release

---

# F1 — Project setup

## ISSUE-F1.1 — Project scaffold and core dependencies

**Labels:** `phase:f1`, `type:setup`, `priority:p1`
**Milestone:** F1

### User story
As a developer, I want a properly scaffolded Expo project with all core dependencies installed, so that I can start building screens without fighting tooling.

### Acceptance criteria
- [ ] Project initialized with `create-expo-app` using TypeScript template
- [ ] TypeScript strict mode enabled in `tsconfig.json`
- [ ] Navigation libraries installed: `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-safe-area-context`, `react-native-screens`
- [ ] Utility libraries installed: `expo-location`, `expo-linking`, `@gorhom/bottom-sheet`, `react-native-reanimated`, `react-native-gesture-handler`
- [ ] Storage installed: `@react-native-async-storage/async-storage`
- [ ] Folder structure created: `src/api/`, `src/hooks/`, `src/components/`, `src/screens/`, `src/theme/`, `src/types/`, `src/navigation/`, `src/lib/`
- [ ] `App.tsx` renders `GestureHandlerRootView` + `SafeAreaProvider` + `NavigationContainer` with empty stack
- [ ] Placeholder "FieldStack loading…" text visible on launch
- [ ] `.env` file created with `EXPO_PUBLIC_API_URL` placeholder
- [ ] App builds and runs on Expo Go without crashes

### Technical implementation
**Commands:**
- `npx create-expo-app@latest fieldstack-app --template default`
- `npx expo install` for each dependency

**Files to create:**
- `App.tsx` (replaces default)
- `src/navigation/RootNavigator.tsx` (empty stack for now)
- `.env` with `EXPO_PUBLIC_API_URL=http://localhost:3000` placeholder

**Verify before closing:**
- App launches on Expo Go
- No TypeScript errors
- Folder structure matches spec

### Out of scope
- Tokens, types, API client (separate issues)
- Any screens
- Backend integration

### Cross-cutting refs
None — pure setup.

---

## ISSUE-F1.2 — Design tokens with light and dark mode

**Labels:** `phase:f1`, `type:foundation`, `priority:p1`
**Milestone:** F1

### User story
As a developer, I want a single source of truth for spacing, colors, and typography, so that the app stays visually consistent and is portable to web later.

### Acceptance criteria
- [ ] `src/theme/tokens.ts` exports `spacing`, `borderRadius`, `fontSize`, `fontWeight`, and `colors` objects
- [ ] Spacing scale: `{ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }`
- [ ] Border radius: `{ sm: 6, md: 8, lg: 12, xl: 16 }`
- [ ] Font size: `{ xs: 11, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 }`
- [ ] Font weight: `{ regular: '400', medium: '500', bold: '600' }`
- [ ] Colors: separate `light` and `dark` sets, each with `brand`, `brandDark`, `surface`, `surfaceSecondary`, `textPrimary`, `textSecondary`, `textTertiary`, `border`, `success`, `danger`, `overlay`
- [ ] `src/theme/useTheme.ts` exports a `useTheme()` hook that returns the correct color set based on `useColorScheme()` from `react-native`
- [ ] Color contrast meets WCAG AA in both modes (manually verified)

### Technical implementation
**Files to create:**
- `src/theme/tokens.ts`
- `src/theme/useTheme.ts`

**Patterns:**
- Tokens are plain TS exports, not in a context — usable in any module
- `useTheme()` returns the active palette only (not light + dark together)
- Brand color: a vibrant green that works for soccer/sports (suggest `#1DB954`-style green, dev to confirm)

**Verify before closing:**
- Import `spacing` from tokens in `App.tsx` and use it — no errors
- Toggle device dark mode, confirm `useTheme()` returns different colors

### Out of scope
- Applying tokens to actual screens
- Theme switcher UI

### Cross-cutting refs
- REQ-F0.5, REQ-F0.9

---

## ISSUE-F1.3 — TypeScript types matching backend API

**Labels:** `phase:f1`, `type:foundation`, `priority:p1`
**Milestone:** F1

### User story
As a developer, I want TypeScript types that mirror the backend response shapes, so that the frontend stays in sync with the API and catches breakage at compile time.

### Acceptance criteria
- [ ] `src/types/api.ts` exports types matching the backend schema
- [ ] `Operator` type with `id`, `name`, `website`, `phone`, `integration_type`
- [ ] `Venue` type with `id`, `operator_id`, `name`, `address`, `lat`, `lng`, `photos`, `amenities`, `website`, `is_active`
- [ ] `Field` type with `id`, `venue_id`, `name`, `surface`, `size`, `price_per_hour`, `booking_url`, `booking_platform`, `is_active`
- [ ] `VenueWithFields` type as `Venue & { fields: Field[] }`
- [ ] `SearchResult` type as `{ field: Field, venue: Pick<Venue, 'id' | 'name' | 'lat' | 'lng' | 'address' | 'photos'> }`
- [ ] Enums (`surface`, `size`, `integration_type`, `booking_platform`) defined as string literal unions
- [ ] All types exported and importable from `src/types/api.ts`

### Technical implementation
**Files to create:**
- `src/types/api.ts`

**Patterns:**
- Use string literal unions for enums (e.g. `type Surface = 'turf' | 'grass' | 'concrete' | 'indoor'`)
- Match field names exactly to backend (snake_case where backend uses snake_case)
- Use `number` for numeric fields (no `BigNumber` etc.)

**Verify before closing:**
- Import a type into `App.tsx` and use it — no TS errors
- Types match the backend's `database.ts` generated by Supabase

### Out of scope
- Runtime validation (Zod) — backend handles this
- Types for non-API data (UI-only state)

### Cross-cutting refs
None.

---

## ISSUE-F1.4 — API client and resource modules

**Labels:** `phase:f1`, `type:foundation`, `priority:p1`
**Milestone:** F1

### User story
As a developer, I want a typed API client layer, so that every screen fetches data through one consistent interface and the backend can be swapped without touching screens.

### Acceptance criteria
- [ ] `src/api/client.ts` exports a typed `get<T>` function
- [ ] `get` reads `EXPO_PUBLIC_API_URL` from `process.env`
- [ ] `get` returns `{ data: T | null, error: Error | null }` consistently
- [ ] `get` handles network errors, non-2xx responses, JSON parse errors
- [ ] `get` uses `AbortController` for a 10-second timeout
- [ ] `src/api/venues.ts` exports `getVenues(params?)`, `getVenue(id)`, `getVenueFields(id, params?)`
- [ ] `src/api/fields.ts` exports `getField(id)`
- [ ] `src/api/search.ts` exports `searchFields(params)` returning `{ data, total, error }`
- [ ] All resource functions are typed using types from `src/types/api.ts`

### Technical implementation
**Files to create:**
- `src/api/client.ts`
- `src/api/venues.ts`
- `src/api/fields.ts`
- `src/api/search.ts`

**Patterns:**
- One `client.ts` fetch wrapper used by every resource module
- Resource modules contain only typed function exports — no React, no hooks
- Search returns `{ data, total, error }` — extra `total` field for result count UI
- Query params serialized as URL query string

**Verify before closing:**
- Temporarily call `getVenues()` in `App.tsx` and `console.log` the result — confirm real data returns from backend
- Remove the test code before closing the issue

### Out of scope
- React hooks (separate issues)
- Caching at the client level (handled per-hook if needed)
- Auth headers (no auth in v1)

### Cross-cutting refs
None.

---

## ISSUE-F1.5 — Analytics wrapper

**Labels:** `phase:f1`, `type:foundation`, `priority:p2`
**Milestone:** F1

### User story
As the FieldStack team, I want analytics calls to go through a single wrapper, so that we can swap providers later without touching every screen.

### Acceptance criteria
- [ ] `src/lib/analytics.ts` exports `track(eventName: string, properties?: Record<string, unknown>)`
- [ ] In v1, `track` writes events to console — provider integration is deferred
- [ ] All event names from REQ-F0.6 are exported as constants from the same file
- [ ] No screens or hooks call analytics directly — only via `track`

### Technical implementation
**Files to create:**
- `src/lib/analytics.ts`

**Patterns:**
- Stub implementation: `console.log('[analytics]', eventName, properties)`
- Real provider (PostHog, Mixpanel, etc.) wired in later — interface stays the same
- Event name constants prevent typos: `EVENT_BOOKING_CTA_TAPPED = 'booking_cta_tapped'`

**Verify before closing:**
- Call `track('app_opened')` in `App.tsx` on mount — confirm it logs to console

### Out of scope
- Real analytics provider integration (post-MVP)
- User identification / sessions

### Cross-cutting refs
- REQ-F0.6

---

## ISSUE-F1.6 — Onboarding flow (welcome, location permission, sport preference)

**Labels:** `phase:f1`, `type:screen`, `priority:p1`
**Milestone:** F1

### User story
As a first-time user, I want a brief onboarding that explains the app and requests location permission, so that I understand what FieldStack does before being asked for permissions.

### Acceptance criteria
- [ ] WHEN the app cold starts AND onboarding is incomplete, THE app SHALL navigate to the Onboarding flow
- [ ] WHEN onboarding is complete, THE app SHALL navigate directly to the Venue List Screen
- [ ] Onboarding completion state SHALL persist across restarts (AsyncStorage)
- [ ] Welcome screen SHALL display logo, one-line value prop ("Find and book soccer fields across the GTA"), "Get started" CTA, and "Skip" link
- [ ] Location permission screen SHALL display a primer ("So we can show you fields near you") BEFORE triggering the system permission dialog
- [ ] WHEN user taps "Enable location", THE app SHALL request foreground permission only
- [ ] IF granted, THEN app SHALL fetch coordinates and proceed
- [ ] IF denied, THEN app SHALL proceed with default location (downtown Toronto) — never re-prompt
- [ ] Sport preference screen SHALL allow multi-select size chips (5v5, 7v7, 11v11) plus "No preference" plus "Skip"
- [ ] Selected preference SHALL persist locally and be applied as default filter on Field Search Screen

### Technical implementation
**Files to create:**
- `src/screens/OnboardingWelcomeScreen.tsx`
- `src/screens/OnboardingLocationScreen.tsx`
- `src/screens/OnboardingSportScreen.tsx`
- `src/lib/storage.ts` (AsyncStorage wrapper for onboarding state, sport preference)
- `src/lib/location.ts` (helpers for `requestForegroundPermissionsAsync`, `getCurrentPositionAsync`)

**Patterns:**
- Onboarding is its own stack inside RootNavigator, conditionally rendered based on persisted state
- `storage.ts` exports `getOnboardingComplete`, `setOnboardingComplete`, `getSportPreference`, `setSportPreference`
- Location permission uses primer pattern: custom screen with explanation, then the system dialog on tap

**Verify before closing:**
- Fresh install → onboarding shows
- Complete onboarding → relaunch → goes straight to Venue List
- Deny location → app still works with default Toronto
- Sport preference saved → reflected in search filters

### Out of scope
- Account creation
- Email collection (deferred to waitlist feature)
- Multi-language support

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5, REQ-F0.8

---

# F2 — Venue list screen

## ISSUE-F2.1 — UI primitive components (Text, Button, Badge, Skeleton, EmptyState)

**Labels:** `phase:f2`, `type:component`, `priority:p1`
**Milestone:** F2

### User story
As a developer, I want reusable UI primitives that all screens use, so that the app stays visually consistent without duplicating styling code.

### Acceptance criteria
- [ ] `Text` component wraps RN `Text`, accepts `size` and `weight` props mapped to tokens, has `variant` prop (`'primary' | 'secondary' | 'tertiary' | 'danger' | 'success'`)
- [ ] `Button` component has variants `'primary' | 'secondary' | 'ghost'`, min 44pt height, pressed state at 0.7 opacity, loading state with spinner, accepts `accessibilityLabel`
- [ ] `Badge` component is a small pill, variants `'neutral' | 'brand' | 'success'`
- [ ] `Skeleton` component is an animated placeholder with subtle pulse, respects Reduce Motion, accepts `width`, `height`, `borderRadius`
- [ ] `EmptyState` component shows icon, title, description, primary action button — centered layout
- [ ] All primitives use `useTheme()` for colors — zero hardcoded values
- [ ] Sentence case on all default labels

### Technical implementation
**Files to create:**
- `src/components/Text.tsx`
- `src/components/Button.tsx`
- `src/components/Badge.tsx`
- `src/components/Skeleton.tsx`
- `src/components/EmptyState.tsx`

**Patterns:**
- All primitives are pure presentational
- `Skeleton` uses `react-native-reanimated` for the pulse, with `AccessibilityInfo.isReduceMotionEnabled()` check
- `Button` includes `hitSlop` if visual size is below 44pt
- `EmptyState` accepts an optional `icon` prop (any ReactNode)

**Verify before closing:**
- Drop each primitive into `App.tsx` temporarily, confirm renders correctly in light and dark mode
- Confirm Reduce Motion disables the Skeleton pulse

### Out of scope
- Form inputs (deferred to F4 search input)
- Modals / sheets (use `@gorhom/bottom-sheet` directly per feature)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.4, REQ-F0.5, REQ-F0.9

---

## ISSUE-F2.2 — useVenues hook

**Labels:** `phase:f2`, `type:hook`, `priority:p1`
**Milestone:** F2

### User story
As a developer, I want a single hook that handles fetching venues with loading and error state, so that screens can consume venue data declaratively.

### Acceptance criteria
- [ ] `useVenues(params?: { lat?: number, lng?: number })` returns `{ data, isLoading, error, refetch }`
- [ ] Calls `getVenues` from `src/api/venues.ts`
- [ ] Manages internal state with `useState` and `useEffect` — no external state library
- [ ] `refetch` is a stable function (`useCallback`)
- [ ] Refetches when `lat` or `lng` change

### Technical implementation
**Files to create:**
- `src/hooks/useVenues.ts`

**Patterns:**
- Standard fetch hook pattern: `useState` for data/loading/error, `useEffect` for fetch trigger, `useCallback` for refetch
- No caching at this layer — keep it simple

**Verify before closing:**
- Import in a temporary test screen and confirm it returns real venue data
- Confirm `isLoading` flips correctly during fetch

### Out of scope
- Caching, deduping, retries (use a library if needed later)
- Pagination

### Cross-cutting refs
None.

---

## ISSUE-F2.3 — VenueCard component

**Labels:** `phase:f2`, `type:component`, `priority:p1`
**Milestone:** F2

### User story
As a player browsing venues, I want each venue card to show photo, name, distance, field info, and price at a glance, so that I can quickly evaluate options.

### Acceptance criteria
- [ ] `VenueCard` is pure presentational — accepts `venue`, `onPress`, no fetching inside
- [ ] Layout: 16:9 photo on top with rounded top corners, body padding `md`
- [ ] Below photo: venue name (`lg`, medium weight), distance (`sm`, secondary), field summary line ("3 fields · turf + grass", `sm`, secondary), price range ("from $80/hr", `md`, medium weight)
- [ ] WHILE photo is loading, THE card SHALL display a neutral placeholder background
- [ ] IF photo fails to load OR venue has zero photos, THEN THE card SHALL display a default soccer field illustration
- [ ] Card has visible pressed state (opacity reduction)
- [ ] `accessibilityLabel` combines name, distance, and field count into a single readable string
- [ ] Touch target on card is at least 44pt
- [ ] All styling from tokens — zero hardcoded values

### Technical implementation
**Files to create:**
- `src/components/VenueCard.tsx`
- `src/assets/placeholder-field.png` (default illustration)

**Patterns:**
- Pure presentational — `onPress` is a prop, navigation logic lives in the screen
- Use RN `Image` with `onError` to swap to placeholder
- Field summary string built inline from `venue.fields` array

**Verify before closing:**
- Card renders correctly with full data, with no photos, and with a broken photo URL
- Pressing the card fires `onPress` only once (no duplicates)

### Out of scope
- Favoriting / heart icon (v2)
- Share button

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.4, REQ-F0.5

---

## ISSUE-F2.4 — LocationPill component

**Labels:** `phase:f2`, `type:component`, `priority:p1`
**Milestone:** F2

### User story
As a player, I want to see and change which area I'm browsing, so that I can find fields in a different neighbourhood.

### Acceptance criteria
- [ ] `LocationPill` shows current search area as a pill ("Near Toronto")
- [ ] Pressable — fires `onPress` prop
- [ ] WHEN location permission is denied AND no manual location is set, THE pill SHALL display "Set location" with a distinct visual treatment (e.g. brand-colored border or icon)
- [ ] Touch target at least 44pt
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/LocationPill.tsx`

**Patterns:**
- Accepts `label` and `variant` (`'default' | 'prompt'`) as props
- Parent screen decides which variant based on permission state

**Verify before closing:**
- Both variants render correctly
- Tap fires `onPress`

### Out of scope
- The Location Picker Sheet itself (stub the picker initially — log to console)

### Cross-cutting refs
- REQ-F0.2, REQ-F0.5

---

## ISSUE-F2.5 — Venue List Screen

**Labels:** `phase:f2`, `type:screen`, `priority:p1`
**Milestone:** F2

### User story
As a player looking for somewhere to play, I want to see a list of soccer venues near me, so that I can quickly find options without searching.

### Acceptance criteria
- [ ] WHEN the user opens the screen, THE screen SHALL display venues sorted by distance from user location
- [ ] WHEN location is unavailable, THE screen SHALL default to downtown Toronto
- [ ] Top bar contains: `LocationPill` (left), filter icon button (right, no-op for now)
- [ ] Top bar respects top safe area
- [ ] FlatList renders `VenueCard` per venue
- [ ] Pull-to-refresh triggers refetch via `useVenues`
- [ ] WHILE loading initial data, THE screen SHALL display 3 `Skeleton` placeholders matching `VenueCard` dimensions
- [ ] WHEN no venues exist within range, THE screen SHALL display `EmptyState` with "Widen your search" action
- [ ] WHEN refetch fails, THE screen SHALL display an error toast and keep existing data visible
- [ ] WHEN user taps a `VenueCard`, THE app SHALL navigate to Venue Detail Screen with that venue's id
- [ ] Initial load completes within 2 seconds on 4G
- [ ] Logs `app_opened` analytics event on mount (REQ-F0.6)

### Technical implementation
**Files to create:**
- `src/screens/VenueListScreen.tsx`

**Patterns:**
- Uses `useVenues` for data
- `LocationPill onPress` stubs to `console.log` for now (Location Picker Sheet is post-MVP)
- Filter icon is a no-op button for now (the Field Search Screen is where filtering lives)
- Navigation: `navigation.navigate('VenueDetail', { id: venue.id })`

**Verify before closing:**
- Real data loads from backend
- Pull-to-refresh works
- Skeleton displays during initial load
- Empty state action button works (logs to console for now)
- Tapping a card navigates correctly

### Out of scope
- Inline filtering (lives on Field Search Screen)
- Search input (lives on Field Search Screen)
- Location Picker Sheet (stub)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.3, REQ-F0.5, REQ-F0.6, REQ-F0.8

---

# F3 — Venue detail screen

## ISSUE-F3.1 — DateTimeRangePicker component

**Labels:** `phase:f3`, `type:component`, `priority:p1`
**Milestone:** F3

### User story
As a player, I want to select when I want to play, so that I can see which fields fit my time slot.

### Acceptance criteria
- [ ] Pure presentational — accepts `selectedDate`, `selectedStartTime`, `selectedDuration`, `onDateChange`, `onStartTimeChange`, `onDurationChange`
- [ ] Date row: horizontal FlatList of next 7 days as tappable pills ("Today", "Tomorrow", then "Mon Dec 8" format)
- [ ] Selected date: filled brand color AND a checkmark icon (not color alone, per REQ-F0.1)
- [ ] Start time picker: 30-minute intervals, 6am to 11pm
- [ ] Duration picker: single-select chips for 1hr, 1.5hr, 2hr, 2.5hr, 3hr
- [ ] Default: today, next full hour, 1hr duration
- [ ] Selection haptic on every change
- [ ] IF start + duration exceeds 11:59pm, THEN THE component SHALL prevent selection and display a hint
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/DateTimeRangePicker.tsx`

**Patterns:**
- Pure presentational — no internal state for the values themselves (parent owns them)
- Internal state only for things like which sub-picker is expanded
- Use `expo-haptics` for selection feedback (with system setting check)

**Verify before closing:**
- All three sub-pickers update parent state
- Invalid duration shows hint, doesn't update parent
- Haptics fire on iOS / Android device (not simulator)

### Out of scope
- Custom time entry (use the chips for v1)
- Repeat / recurring booking (v2)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.4, REQ-F0.5

---

## ISSUE-F3.2 — useVenue hook

**Labels:** `phase:f3`, `type:hook`, `priority:p1`
**Milestone:** F3

### User story
As a developer, I want a hook that fetches a single venue with its fields, so that the venue detail screen can consume one source.

### Acceptance criteria
- [ ] `useVenue(venueId)` returns `{ data, isLoading, error }`
- [ ] Calls `getVenue` from `src/api/venues.ts`
- [ ] Refetches when `venueId` changes

### Technical implementation
**Files to create:**
- `src/hooks/useVenue.ts`

### Cross-cutting refs
None.

---

## ISSUE-F3.3 — PhotoGallery component

**Labels:** `phase:f3`, `type:component`, `priority:p1`
**Milestone:** F3

### User story
As a player, I want to swipe through venue photos, so that I can see what the place looks like.

### Acceptance criteria
- [ ] Horizontal FlatList of photos, full-width, 16:9 aspect ratio
- [ ] Page indicator dots at bottom — only visible if 2+ photos
- [ ] WHERE venue has zero photos, THE gallery SHALL display a default soccer field illustration
- [ ] Smooth paging snap behavior
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/PhotoGallery.tsx`

**Patterns:**
- Use FlatList with `pagingEnabled` and `horizontal`
- Track current page in internal state for the dots indicator

### Out of scope
- Pinch-zoom
- Full-screen photo viewer

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5

---

## ISSUE-F3.4 — AmenityChip component

**Labels:** `phase:f3`, `type:component`, `priority:p2`
**Milestone:** F3

### User story
As a player, I want to see at a glance what amenities a venue has, so that I can plan accordingly.

### Acceptance criteria
- [ ] Small chip with icon + label (Parking, Changerooms, Lighting, Washrooms, Indoor)
- [ ] Pure presentational — accepts `amenity` prop (string), maps to icon and label
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/AmenityChip.tsx`

### Cross-cutting refs
- REQ-F0.5

---

## ISSUE-F3.5 — FieldAvailabilityCard component

**Labels:** `phase:f3`, `type:component`, `priority:p1`
**Milestone:** F3

### User story
As a player who likes a venue, I want to see all the fields at the venue with a clear book action, so that I can pick the one that suits my game.

### Acceptance criteria
- [ ] Pure presentational — accepts `field`, `selectedDate`, `selectedTime`, `onCardPress`, `onBookPress`
- [ ] Layout: field name (`md`, medium) + surface badge + size badge in a row, price/hr below, "Book" primary button on the right
- [ ] Card body tappable → fires `onCardPress` (parent navigates to Field Detail)
- [ ] "Book" button → fires `onBookPress` (parent opens BookingBottomSheet)
- [ ] Touch target at least 44pt for both card and button
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/FieldAvailabilityCard.tsx`

**Patterns:**
- Two distinct tap zones — card body navigates, button opens sheet
- Use `Pressable` with `hitSlop` for the button to ensure it doesn't accidentally trigger card press

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.5

---

## ISSUE-F3.6 — BookingBottomSheet component

**Labels:** `phase:f3`, `type:component`, `priority:p1`
**Milestone:** F3

### User story
As a player about to book, I want to confirm I'm leaving the app before being redirected, so that I'm not surprised.

### Acceptance criteria
- [ ] Uses `@gorhom/bottom-sheet`
- [ ] Props: `visible`, `field`, `venue`, `selectedDate`, `selectedTime`, `onConfirm`, `onDismiss`
- [ ] Displays operator name + "You'll be taken to [Operator name] to complete your booking"
- [ ] Displays selected date + time as a confirmation summary
- [ ] "Confirm" button: triggers light haptic, logs `booking_redirect_confirmed` analytics event, opens `field.booking_url` via `expo-linking`
- [ ] IF `booking_platform` is `playtomic` or `courtreserve`, THEN URL SHALL include date/time as query params
- [ ] IF `expo-linking` fails, THEN sheet SHALL display error toast with "Copy link" fallback
- [ ] WHEN user dismisses sheet, parent screen state is preserved
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/BookingBottomSheet.tsx`
- `src/lib/bookingUrl.ts` (helper to build URL with date/time params per platform)

**Patterns:**
- `bookingUrl.ts` exports `buildBookingUrl(field, date, time)` returning the final URL string
- Each platform has its own param format — encapsulate in this helper

**Verify before closing:**
- Booking URL opens browser correctly
- Date/time params present for Playtomic and CourtReserve URLs
- Error toast shows if URL is malformed (test with bad URL)

### Out of scope
- In-app browser (use system browser via `expo-linking`)
- Booking confirmation tracking (post-redirect — operator handles this)

### Cross-cutting refs
- REQ-F0.4, REQ-F0.6

---

## ISSUE-F3.7 — Venue Detail Screen

**Labels:** `phase:f3`, `type:screen`, `priority:p1`
**Milestone:** F3

### User story
As a player who has selected a venue, I want to see all the venue's information and pick a time to find available fields, so that I can decide which field to book.

### Acceptance criteria
- [ ] Layout (scrollable): PhotoGallery → header (name `xl`, address `sm` secondary, distance `sm` secondary) → AmenityChip row (only amenities the venue has, no placeholders) → "Pick a time" section with DateTimeRangePicker → "Available fields" section with FieldAvailabilityCard list
- [ ] Heart icon button in top right of header — visible but disabled in v1, "Coming soon" tooltip on long press (REQ-F3.5 / v2-deferred)
- [ ] Selected date/time stored in local component state (no global state)
- [ ] Default selected date is today, default time is next full hour
- [ ] WHEN user taps `FieldAvailabilityCard` body, THE app SHALL navigate to Field Detail Screen
- [ ] WHEN user taps "Book" on card, THE BookingBottomSheet SHALL open with selected date/time pre-filled
- [ ] WHEN user taps the venue name elsewhere (e.g. from Field Detail), this same screen loads with the same id
- [ ] Logs `venue_viewed` analytics event with venue id on mount

### Technical implementation
**Files to create:**
- `src/screens/VenueDetailScreen.tsx`

**Patterns:**
- Uses `useVenue(id)` for fetching
- Local `useState` for selectedDate and selectedTime
- BookingBottomSheet visibility controlled by local state
- Heart icon: render the icon, set `disabled={true}`, wrap in `Pressable` with long-press handler that shows tooltip

**Verify before closing:**
- Tap venue from list → see all details
- Date/time selection works
- Tap card body → goes to Field Detail
- Tap Book → opens sheet → Confirm → opens browser with booking URL
- Heart icon long-press shows "Coming soon"

### Out of scope
- Real-time availability (v2)
- Reviews / ratings (v2)
- Save venue functionality (v2 — UI present, disabled)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.3, REQ-F0.5, REQ-F0.6, REQ-F0.7, REQ-F0.8

---

# F4 — Field search screen

## ISSUE-F4.1 — FilterChip component

**Labels:** `phase:f4`, `type:component`, `priority:p1`
**Milestone:** F4

### User story
As a player, I want to see and toggle filters as inline chips, so that I can quickly refine my search.

### Acceptance criteria
- [ ] Pure presentational — accepts `label`, `isActive`, `count`, `onPress`, `onClear`
- [ ] Inactive: outlined chip with label
- [ ] Active: filled chip with label, count badge (if applicable), and clear (X) icon
- [ ] `onClear` only rendered when active and provided
- [ ] Touch target ≥ 44pt, `hitSlop` on the X icon
- [ ] 8pt minimum spacing between chips (consumer's responsibility, but documented)
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/FilterChip.tsx`

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.5

---

## ISSUE-F4.2 — FilterBottomSheet component

**Labels:** `phase:f4`, `type:component`, `priority:p1`
**Milestone:** F4

### User story
As a player, I want a clear sheet to pick filter options, so that I can apply complex filters without leaving the search screen.

### Acceptance criteria
- [ ] Uses `@gorhom/bottom-sheet`
- [ ] Generic — accepts `visible`, `title`, `options`, `selected`, `mode` (`'single' | 'multi'`), `onSelect`, `onDismiss`
- [ ] Renders options as tappable rows with checkmarks (filled for selected)
- [ ] "Clear" link in top right of sheet header
- [ ] "Apply" CTA at bottom (or auto-applies on select for `single` mode)
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/FilterBottomSheet.tsx`

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5

---

## ISSUE-F4.3 — useFieldSearch hook

**Labels:** `phase:f4`, `type:hook`, `priority:p1`
**Milestone:** F4

### User story
As a developer, I want a single hook that manages search params, debouncing, persistence, and fetching, so that the screen stays focused on UI.

### Acceptance criteria
- [ ] Returns `{ results, total, isLoading, error, filters, setFilter, clearFilters, setLocation }`
- [ ] Manages: `locationText`, `lat`, `lng`, `surface` (string[]), `size` (string[]), `priceMax` (number | null), `sort`
- [ ] Debounces filter param changes by 300ms before calling API
- [ ] `setLocation(text)` debounces 500ms then geocodes via `expo-location.geocodeAsync`
- [ ] IF geocoding fails, THEN hook SHALL expose an error state visible to the search input
- [ ] Persists last applied filters to AsyncStorage on every change
- [ ] Restores persisted filters on mount
- [ ] `clearFilters()` resets state and clears persisted values
- [ ] Logs `search_filtered` analytics event with active filters when results refresh due to filter changes

### Technical implementation
**Files to create:**
- `src/hooks/useFieldSearch.ts`

**Patterns:**
- Two debounces: filter changes (300ms) and location text (500ms) — separate `setTimeout` cleanups
- AsyncStorage key: `fieldstack:lastFilters`
- Default filters: pull sport preference from storage if set (REQ-F1.6)

**Verify before closing:**
- Apply a filter → results update after 300ms
- Type a city → results update after 500ms with geocoded coords
- Close and reopen app → filters restored
- Clear all → AsyncStorage cleared, default state restored

### Cross-cutting refs
- REQ-F0.6

---

## ISSUE-F4.4 — SearchInput component

**Labels:** `phase:f4`, `type:component`, `priority:p1`
**Milestone:** F4

### User story
As a player, I want a search input that I can type a location into, so that I can find fields in a specific area.

### Acceptance criteria
- [ ] Top bar text input with magnifying glass icon (left) and clear (X) button (right, only when input has text)
- [ ] Placeholder: "Search by city, neighbourhood, or postal code"
- [ ] Pure presentational — debouncing handled by parent / hook
- [ ] Inline error hint below input if geocoding fails (does not clear input text)
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/SearchInput.tsx`

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5

---

## ISSUE-F4.5 — FieldSearchCard component

**Labels:** `phase:f4`, `type:component`, `priority:p1`
**Milestone:** F4

### User story
As a player browsing search results, I want each card to show field and venue details at a glance, so that I can quickly identify good options.

### Acceptance criteria
- [ ] Pure presentational — accepts `result` (SearchResult), `onPress`
- [ ] Layout: 80x80 venue photo on left (rounded), right column with field name (`md` medium), venue name (`sm` secondary), surface + size badges in a row, distance (`sm` tertiary), price/hr (`md` medium)
- [ ] Default placeholder if no photos
- [ ] `accessibilityLabel` combines field name, venue name, and price into a single readable string
- [ ] Touch target ≥ 44pt
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/FieldSearchCard.tsx`

### Cross-cutting refs
- REQ-F0.1, REQ-F0.2, REQ-F0.5

---

## ISSUE-F4.6 — Field Search Screen

**Labels:** `phase:f4`, `type:screen`, `priority:p1`
**Milestone:** F4

### User story
As a player who knows what kind of field I want, I want to search and filter fields by location, surface, size, and price, so that I see only relevant options.

### Acceptance criteria
- [ ] Sticky top bar (respects top safe area): SearchInput + filter icon button (right)
- [ ] Inline filter chips row (horizontal scroll): Surface (multi), Size (multi), Price (single, preset ranges "Under $80", "$80–$120", "$120+")
- [ ] "Clear all filters" link visible when at least one filter is active
- [ ] Result count label: "14 fields near Toronto" — updates live as filters change
- [ ] FlatList of FieldSearchCard sorted by distance by default
- [ ] WHILE loading, THE screen SHALL display 5 Skeleton placeholders
- [ ] WHEN no results, THE screen SHALL display EmptyState with two CTAs: "Clear filters" and "Widen radius"
- [ ] Floating "Map view" button at bottom center, above bottom safe area
- [ ] Tapping a FieldSearchCard navigates to Field Detail Screen
- [ ] Filter changes update results within 300ms (post-debounce)
- [ ] Filters persist across app launches

### Technical implementation
**Files to create:**
- `src/screens/FieldSearchScreen.tsx`

**Patterns:**
- Uses `useFieldSearch` for everything
- FilterChip components wired to open FilterBottomSheet with relevant options
- Surface options: `['turf', 'grass', 'concrete', 'indoor']`
- Size options: `['5v5', '7v7', '11v11']`
- Price options: `[null, 80, 120]` mapping to ranges

**Verify before closing:**
- Type city → results update after geocoding
- Apply filters (multi-select surface, single-select price) → results update
- Close app → reopen → filters restored
- "Clear all" works
- Empty state CTAs work
- Map view button navigates correctly

### Out of scope
- Map view itself (separate issue)
- "Sort by" UI (default to distance for v1)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.3, REQ-F0.5, REQ-F0.6, REQ-F0.8

---

# F5 — Field detail screen + map view

## ISSUE-F5.1 — useField hook

**Labels:** `phase:f5`, `type:hook`, `priority:p1`
**Milestone:** F5

### User story
As a developer, I want a hook that fetches a single field with its venue, so that the field detail screen has one source.

### Acceptance criteria
- [ ] `useField(fieldId)` returns `{ data, isLoading, error }`
- [ ] Calls `getField` from `src/api/fields.ts`
- [ ] Refetches when `fieldId` changes

### Technical implementation
**Files to create:**
- `src/hooks/useField.ts`

### Cross-cutting refs
None.

---

## ISSUE-F5.2 — StickyFooter component

**Labels:** `phase:f5`, `type:component`, `priority:p2`
**Milestone:** F5

### User story
As a player, I want primary actions to stay visible while I scroll, so that I don't have to scroll back up to act.

### Acceptance criteria
- [ ] Wrapper component that respects bottom safe area inset
- [ ] Children render with appropriate padding above gesture bar
- [ ] Subtle top border or shadow to separate from scrolling content
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/StickyFooter.tsx`

### Cross-cutting refs
- REQ-F0.5, REQ-F0.8

---

## ISSUE-F5.3 — Field Detail Screen

**Labels:** `phase:f5`, `type:screen`, `priority:p1`
**Milestone:** F5

### User story
As a player evaluating a specific field, I want to see all the field's details and book it for a chosen time, so that I can secure the slot.

### Acceptance criteria
- [ ] Layout (scrollable, sticky footer): PhotoGallery (venue photos) → header with field name (`xl`) + surface/size badges + heart icon (disabled, "Coming soon" on long press) → venue name (`md` secondary, tappable → Venue Detail) → price section (large "$120/hr") → field specs (label/value rows: Surface, Size, Lighting, Indoor/Outdoor) → venue amenities row
- [ ] StickyFooter with full-width "Book this field" primary button
- [ ] WHEN user taps "Book this field", THE BookingTimeSheet SHALL open
- [ ] BookingTimeSheet contains: DateTimeRangePicker + operator notice ("You'll be taken to [operator] to book") + "Confirm and book" button
- [ ] WHEN user confirms, THE app SHALL open booking URL via `expo-linking` with date/time params if platform supports it
- [ ] WHEN user dismisses sheet without confirming, THE screen state is preserved
- [ ] Logs `field_viewed` analytics event with field id on mount
- [ ] Logs `booking_cta_tapped` when "Book this field" is tapped

### Technical implementation
**Files to create:**
- `src/screens/FieldDetailScreen.tsx`
- `src/components/BookingTimeSheet.tsx` (similar to BookingBottomSheet but with date/time picker built in)

**Patterns:**
- Reuses `DateTimeRangePicker` and `bookingUrl.ts` helper from F3
- BookingTimeSheet visibility in local state
- Date/time selection pre-defaults to today + next full hour

**Verify before closing:**
- Open from search → see all details
- Open from venue detail → see all details
- Tap venue name → navigate to Venue Detail
- Tap Book → sheet opens → Confirm → browser opens with date/time params
- Heart long-press shows "Coming soon"

### Out of scope
- Real-time availability check (v2)
- Save field (v2 — UI present, disabled)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.3, REQ-F0.5, REQ-F0.6, REQ-F0.7, REQ-F0.8

---

## ISSUE-F5.4 — Mapbox setup and dev build

**Labels:** `phase:f5`, `type:setup`, `priority:p1`
**Milestone:** F5

### User story
As a developer, I want Mapbox configured and a dev build generated, so that the map view can render on a real device.

### Acceptance criteria
- [ ] `@rnmapbox/maps` installed
- [ ] Mapbox access token stored in `EXPO_PUBLIC_MAPBOX_TOKEN` env var
- [ ] Expo plugin configured in `app.json`
- [ ] Dev build builds and runs successfully (`npx expo run:ios` and `run:android`)
- [ ] README documents the dev build requirement (Mapbox doesn't work in Expo Go)

### Technical implementation
**Files to modify:**
- `app.json` (plugins array)
- `.env`
- `README.md`

### Cross-cutting refs
None.

---

## ISSUE-F5.5 — VenuePin component

**Labels:** `phase:f5`, `type:component`, `priority:p1`
**Milestone:** F5

### User story
As a player viewing the map, I want each venue to show as a pin with the field count, so that I can spot venues with more options.

### Acceptance criteria
- [ ] Custom Mapbox marker — green circle (brand color) with white field count number inside
- [ ] Selected state: larger size + border
- [ ] `accessibilityLabel` reads venue name + field count
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/VenuePin.tsx`

**Patterns:**
- Built using `@rnmapbox/maps` PointAnnotation or SymbolLayer
- Custom view rendered as the marker content

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5

---

## ISSUE-F5.6 — VenuePreviewCard component

**Labels:** `phase:f5`, `type:component`, `priority:p1`
**Milestone:** F5

### User story
As a player tapping a pin, I want a quick preview of the venue, so that I can decide whether to view full details.

### Acceptance criteria
- [ ] Compact card with photo (small, left), venue name, field count, distance
- [ ] "View venue" button → navigates to Venue Detail
- [ ] All styling from tokens

### Technical implementation
**Files to create:**
- `src/components/VenuePreviewCard.tsx`

### Cross-cutting refs
- REQ-F0.5

---

## ISSUE-F5.7 — Map View Screen

**Labels:** `phase:f5`, `type:screen`, `priority:p1`
**Milestone:** F5

### User story
As a player who cares about location, I want to see fields on a map and search a different area by panning, so that I can find venues geographically.

### Acceptance criteria
- [ ] Full-screen Mapbox map, style: Streets v12 or Light
- [ ] Map centers on user location, defaults to downtown Toronto if unavailable
- [ ] VenuePins rendered for current filtered result set from `useFieldSearch`
- [ ] Built-in clustering at low zoom, with cluster marker showing total count
- [ ] WHEN user taps a pin, THE VenuePreviewCard SHALL appear in a bottom sheet
- [ ] WHEN user taps elsewhere on map, THE preview card SHALL dismiss
- [ ] WHEN user pans more than 5km from last search center, THE "Search this area" button SHALL appear at top center
- [ ] WHEN user taps "Search this area", THE search SHALL re-run with new center coords; the button SHALL hide until next pan
- [ ] Floating "List view" button at top left, respects top safe area
- [ ] WHEN user taps "List view", THE app SHALL navigate back to Field Search Screen with filters preserved
- [ ] Map center and zoom persist within the session — restore on return from another screen
- [ ] Map state resets when app is closed and reopened
- [ ] Pan/zoom does not trigger a re-fetch (only the "Search this area" button does)
- [ ] Filters from `useFieldSearch` carry over — same results as the list

### Technical implementation
**Files to create:**
- `src/screens/MapViewScreen.tsx`

**Patterns:**
- Reads from same `useFieldSearch` hook as Field Search Screen — no duplicate fetching
- Map state (center, zoom) stored in a small Zustand slice OR in a custom hook with module-level state — survives navigation but resets on app restart
- "Search this area" pan-distance check: compute haversine distance from last search lat/lng to current map center on every `onRegionDidChange` event

**Verify before closing:**
- Open map → pins render for filtered results
- Tap pin → preview card appears
- Tap "View venue" → navigate to Venue Detail
- Pan 5+ km → "Search this area" button appears → tap → results update
- Navigate to list and back → map state preserved
- Close app and reopen → map state reset

### Out of scope
- Custom map styles / dark mode map (system default for v1)
- Drawing search radius circle on map
- User location dot customization (use Mapbox default)

### Cross-cutting refs
- REQ-F0.1, REQ-F0.5, REQ-F0.7, REQ-F0.8

---

# Build order

Issues should be worked in this order:

1. F1.1 → F1.2 → F1.3 → F1.4 → F1.5 → F1.6
2. F2.1 → F2.2 → F2.3 → F2.4 → F2.5
3. F3.1 → F3.2 → F3.3 → F3.4 → F3.5 → F3.6 → F3.7
4. F4.1 → F4.2 → F4.3 → F4.4 → F4.5 → F4.6
5. F5.1 → F5.2 → F5.3 → F5.4 → F5.5 → F5.6 → F5.7

Each issue should be a separate branch and PR. Verify the issue's acceptance criteria before merging.

---

# How to use with Claude Code

When working an issue, paste this prompt:

```
Work on issue #N from the FieldStack repo.

Read:
1. The issue body for user story, ACs, and technical implementation
2. docs/standards.md for cross-cutting requirements
3. Any linked dependencies

Build the code following the technical implementation notes. Check off each AC
in the issue as you complete it. When done, open a PR linking the issue.

Verify each "Verify before closing" item by running the app on Expo Go (or dev
build for Mapbox issues).
```

---

# Out of scope for v1 (deferred to v2)

- Real-time availability checks
- In-app booking / payments
- User accounts and authentication
- Saving fields and venues (heart icons present but disabled)
- Reviews and ratings
- Push notifications
- In-app share sheet
- Landscape orientation
- Tablet-optimized layouts
- Web app (separate phase)
