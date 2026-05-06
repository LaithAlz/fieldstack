# FieldStack — Engineering standards

Cross-cutting requirements that every screen and component must satisfy. Issue bodies link here rather than duplicating these.

_Generated from fieldstack-app/docs/fieldstack-issues.md — edit the F0 section there, not this file._


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

