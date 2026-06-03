# Build Log
*Owned by Architect. Updated by Builder after each step.*

---

## Current Status

**Active step:** All 11 steps complete
**Last cleared:** Step 11 — 2026-06-02
**Pending deploy:** NO

---

## Step History

### Step 1 — #203: Field-size enum missing "futsal" and "3v3" — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/203-field-size-enum`*

Files changed:
- `src/routes/venues.ts` — added `"futsal"` and `"3v3"` to `FieldFiltersQuery` size enum

Decisions made:
- `src/routes/search.ts` already had both values; no change needed there.

---

### Step 2 — #204: Proximity query silently drops deleted venues — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/204-proximity-query-drop`*

Files changed:
- `src/lib/queries/venues.ts` — added `ListVenuesResult` type, warn log for dropped ids, `dropped` count in return
- `src/routes/venues.ts` — surfaced `dropped` field in `/venues` API response

Decisions made:
- Changed `listVenues` return type from `VenueWithFields[]` to `ListVenuesResult`. Route handler now returns `{ data: result.venues, dropped: result.dropped, error: null }`.

---

### Step 3 — #194: Brand name "Onside" vs "Fieldstack" inconsistency — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/194-brand-name`*

Files changed:
- `fieldstack-app/src/screens/main/SettingsScreen.tsx` — updated URLs and SUPPORT_EMAIL to `onside.app`; updated comment
- `fieldstack-app/src/screens/main/SignInScreen.tsx` — updated JSDoc comment
- `fieldstack-app/src/components/ErrorBoundary.tsx` — updated `DEFAULT_CONTACT` email to `support@onside.app`

Decisions made:
- `WelcomeScreen.tsx` already had "Onside" at line 65; no change needed.
- `SignInScreen.tsx` line 396 already had "Onside"; line 36 was a JSDoc comment updated.
- Updated `fieldstack.app` URLs to `onside.app` in constants — these appear in toasts/emails shown to users.

---

### Step 4 — #199: Toast does not cancel animation on unmount — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/199-toast-unmount`*

Files changed:
- `fieldstack-app/src/components/Toast.tsx` — added `translateY.stopAnimation()` and `opacity.stopAnimation()` in cleanup effect; added `opacity` and `translateY` to effect deps array

---

### Step 5 — #197: FilterBottomSheet queueMicrotask in render — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/197-filterbottomsheet-microtask`*

Files changed:
- `fieldstack-app/src/components/FilterBottomSheet.tsx` — replaced `queueMicrotask(() => setStaged(...))` pattern with `useEffect(() => { setStaged(config.selected) }, [config])`; added `useEffect` to imports; removed now-unused `lastConfigRef`

---

### Step 6 — #198: ReviewSection ghost error on double-submit — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/198-reviewsection-race`*

Files changed:
- `fieldstack-app/src/components/ReviewSection.tsx` — moved `setError(null)` to top of `handleSubmit`; added `isSubmitting` state; wrapped async work in try/finally; added `disabled={isSubmitting}` to submit button

---

### Step 7 — #200: useFieldSearch filter restore overwrites user changes — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/200-fieldsearch-restore-guard`*

Files changed:
- `fieldstack-app/src/hooks/useFieldSearch.tsx` — gated `setFilters(stored)` behind `if (!restoredRef.current)` check; set `restoredRef.current = true` immediately after

Decisions made:
- `restoredRef` already existed in the file but wasn't used as a guard for the setFilters call. The fix adds the guard without adding a new ref.

---

### Step 8 — #201: useLocation silent Toronto fallback — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/201-uselocation-error-fields`*

Files changed:
- `fieldstack-app/src/hooks/useLocation.ts` — added `coordsFetchFailed: boolean` to `LocationState`; set `true` when GPS returns null with permission granted; `false` otherwise
- `fieldstack-app/src/screens/main/VenueListScreen.tsx` — destructured `coordsFetchFailed`; added GPS-failure case to `EmptyState`
- `fieldstack-app/src/screens/main/FieldSearchScreen.tsx` — destructured `coordsFetchFailed`; added `console.warn`
- `fieldstack-app/src/screens/main/MapViewScreen.tsx` — destructured `coordsFetchFailed`; added `console.warn`

Decisions made:
- `permissionStatus` was already in the hook return; no change needed for that field.
- FieldSearchScreen and MapViewScreen have no existing UI slot for `coordsFetchFailed` — logged per brief's instructions; noted as Known Gap below.

---

### Step 9 — #196: Returning user sees onboarding flash on cold start — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/196-persistence-gate-hydration`*

Files changed:
- `fieldstack-app/src/lib/onboardingContext.tsx` — added `hydrated: boolean` to `OnboardingContextValue`; added `onboardingResolved` prop to `OnboardingProvider`; exposed it via context
- `fieldstack-app/App.tsx` — imported `useOnboarding`; passed `onboardingResolved={isReady}` to `OnboardingProvider`; added `onboardingHydrated` gate to `PersistenceGate`

Decisions made:
- Added `onboardingResolved` prop to `OnboardingProvider` rather than having the provider do its own AsyncStorage read, to keep the `SPLASH_CAP_MS` timeout logic centralized in App.tsx where it already lives.

---

### Step 10 — #202: SavedVenues optimistic update diverges from cloud — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/202-savedvenues-retry`*

Files changed:
- `fieldstack-app/src/lib/savedVenues.tsx` — added `retryCloudWrite` helper (3 attempts, 500ms exponential backoff); added `pendingSync` state; restructured `toggle` to separate optimistic update from cloud write; rollback + error toast on all-retry-failure; added `pendingSync` to context value and type

---

### Step 11 — #195: Password recovery deep-link logs in instead of reset — COMPLETE
*Date: 2026-06-02*
*Branch: `fix/195-password-recovery-screen`*

Files changed:
- `fieldstack-app/src/lib/auth.tsx` — updated `parseSupabaseAuthUrl` to return `type` param; added `pendingRecovery` state and `clearPendingRecovery` callback; set `pendingRecovery = true` on `type=recovery` deep link
- `fieldstack-app/src/navigation/MainNavigator.tsx` — added `SetNewPassword` to `MeStackParamList` and `MeStackNavigator`; imported `SetNewPasswordScreen`; added `SetNewPassword` to tab-bar hide list
- `fieldstack-app/src/screens/main/SetNewPasswordScreen.tsx` — new screen with two password inputs, match validation, `supabase.auth.updateUser`, success toast + navigate to Profile, loading/disabled state
- `fieldstack-app/src/screens/main/ProfileScreen.tsx` — added `useEffect` to watch `pendingRecovery` and navigate to `SetNewPasswordScreen`; `ProfileScreen` is always the MeStack root so the redirect fires reliably

Decisions made:
- Recovery redirect effect placed in `ProfileScreen` (always-mounted MeStack root) rather than in `MeStackNavigator` itself, because `useNavigation()` inside a tab screen component refers to the tab navigator, not the inner stack. `ProfileScreen.useNavigation<MeStackParamList>` correctly navigates within the MeStack.

---

## Known Gaps
*Logged here instead of fixed. Addressed in a future step.*

- **KG-1** — `coordsFetchFailed` in `FieldSearchScreen` and `MapViewScreen` has no UI slot — only `console.warn` added. Follow-up needed to surface a user-visible message. — logged 2026-06-02
- **KG-2** — Cross-tab recovery redirect is lazy (fires when user navigates to Me tab). Immediate cross-tab navigate deferred. — logged 2026-06-02

---

## Architecture Decisions
*Locked decisions that cannot be changed without breaking the system.*

- `listVenues` now returns `ListVenuesResult` instead of `VenueWithFields[]` — 2026-06-02
- `pendingRecovery` pattern in AuthContext is the bridge between the Linking handler and the navigator — 2026-06-02
