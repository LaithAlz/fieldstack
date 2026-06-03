# Review Request — Steps 1–10 Re-build
*Written by Builder. Read by Reviewer.*

Ready for Review: YES

---

## What Was Built

10 P1 bug fixes re-landed on individual branches. All branches were recreated from main. Step 11 (fix/195) was already on disk and was not touched.

## Files Changed

| File | Branch | Change |
|---|---|---|
| `src/routes/venues.ts` | fix/203-field-size-enum | Added `"futsal"` and `"3v3"` to `FieldFiltersQuery` size enum |
| `src/lib/queries/venues.ts` | fix/204-proximity-query-drop | Added `ListVenuesResult` type; warn log + `dropped` count for hydration gaps |
| `src/routes/venues.ts` | fix/204-proximity-query-drop | Surfaced `dropped: number` in `/venues` response |
| `fieldstack-app/src/screens/main/SettingsScreen.tsx` | fix/194-brand-name | Updated URLs and email from `fieldstack.app` to `onside.app`; fixed comment |
| `fieldstack-app/src/screens/main/SignInScreen.tsx` | fix/194-brand-name | Updated JSDoc to "Onside"; fixed recursive `leaveSignIn()` call to `nav.goBack()` |
| `fieldstack-app/src/components/ErrorBoundary.tsx` | fix/194-brand-name | Updated `DEFAULT_CONTACT` email to `support@onside.app` |
| `fieldstack-app/src/components/Toast.tsx` | fix/199-toast-unmount | Added `translateY.stopAnimation()` and `opacity.stopAnimation()` in cleanup effect |
| `fieldstack-app/src/components/FilterBottomSheet.tsx` | fix/197-filterbottomsheet-microtask | Replaced `lastConfigRef`/`queueMicrotask` block with `useEffect`; added `useEffect` to imports |
| `fieldstack-app/src/components/ReviewSection.tsx` | fix/198-reviewsection-race | Added `if (busy) return;` guard; moved `setError(null)` first; added `disabled={busy}` to submit button |
| `fieldstack-app/src/hooks/useFieldSearch.tsx` | fix/200-fieldsearch-restore-guard | Gated `setFilters(stored)` behind `if (!restoredRef.current)`; `restoredRef.current = true` set unconditionally after |
| `fieldstack-app/src/hooks/useLocation.ts` | fix/201-uselocation-error-fields | Added `coordsFetchFailed: boolean` to `LocationState`; set `true` when GPS null with permission granted |
| `fieldstack-app/src/screens/main/VenueListScreen.tsx` | fix/201-uselocation-error-fields | Destructured `coordsFetchFailed`; added GPS-failure `EmptyState` case |
| `fieldstack-app/src/screens/main/FieldSearchScreen.tsx` | fix/201-uselocation-error-fields | Destructured `coordsFetchFailed`; added `console.warn` |
| `fieldstack-app/src/screens/main/MapViewScreen.tsx` | fix/201-uselocation-error-fields | Destructured `coordsFetchFailed`; added `console.warn` |
| `fieldstack-app/src/lib/onboardingContext.tsx` | fix/196-persistence-gate-hydration | Added `hydrated: boolean` to context type; added `onboardingResolved` prop to `OnboardingProvider` |
| `fieldstack-app/App.tsx` | fix/196-persistence-gate-hydration | Imported `useOnboarding`; passed `onboardingResolved={isReady}`; added `onboardingHydrated` gate to `PersistenceGate` |
| `fieldstack-app/src/lib/savedVenues.tsx` | fix/202-savedvenues-retry | Added `retryCloudWrite` helper (3 attempts, 500ms exponential backoff); added `pendingSync` state; restructured `toggle` for optimistic → retry → rollback; exposed `pendingSync` in context |

## Open Questions

None. All Arch escalations were resolved before build.

## Known Gaps Logged

- **KG-1** — `coordsFetchFailed` in `FieldSearchScreen` and `MapViewScreen` has no UI slot — `console.warn` only. Follow-up UI needed.
- **KG-2** — Cross-tab recovery redirect is lazy (fires when user navigates to Me tab). Immediate cross-tab navigate deferred.
