import { act, create } from "react-test-renderer";

import { __resetFlagsClientForTests, resolveFlag, useFlag } from "../featureFlags";

// Mock posthog-react-native wholesale so tests never construct a real
// client or touch the network — `useFeatureFlag` becomes a controllable
// jest.fn(), and the default `PostHog` export becomes an inert constructor
// stub (its instance is never inspected; only the mocked hook matters).
const mockUseFeatureFlag = jest.fn();
jest.mock("posthog-react-native", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
    useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
  };
});

describe("resolveFlag", () => {
  it("dev override wins even when PostHog would say off", () => {
    expect(resolveFlag({ devOverride: true, posthogValue: false })).toBe(true);
  });

  it("dev override wins even when PostHog hasn't loaded yet", () => {
    expect(resolveFlag({ devOverride: true, posthogValue: undefined })).toBe(true);
  });

  it("falls through to PostHog's value when there's no override", () => {
    expect(resolveFlag({ devOverride: false, posthogValue: true })).toBe(true);
    expect(resolveFlag({ devOverride: false, posthogValue: false })).toBe(false);
  });

  it("defaults to false when PostHog hasn't resolved (no client, no config)", () => {
    expect(resolveFlag({ devOverride: false, posthogValue: undefined })).toBe(false);
  });

  it("treats a multivariate string variant as off (only `true` counts as on)", () => {
    expect(resolveFlag({ devOverride: false, posthogValue: "control" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook-level wiring — proves useFlag actually calls through to PostHog's
// hook and stays crash-safe when the client is unavailable, i.e. the
// "unconfigured dev build" case the spec calls out explicitly.
// ---------------------------------------------------------------------------

function Harness({ onResult }: { onResult: (value: boolean) => void }) {
  const value = useFlag("in_app_booking");
  onResult(value);
  return null;
}

function renderFlag(): boolean {
  let result: boolean | undefined;
  // react-test-renderer has no type declarations here (see
  // src/types/react-test-renderer.d.ts) — the ambient module resolves every
  // import as `any`. Narrow to just the one method this harness needs.
  let renderer: { unmount: () => void } | undefined;
  act(() => {
    renderer = create(<Harness onResult={(v) => { result = v; }} />);
  });
  act(() => {
    renderer?.unmount();
  });
  return result as boolean;
}

describe("useFlag", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReset();
    __resetFlagsClientForTests();
  });

  it("resolves to false without crashing when PostHog's hook returns undefined (unconfigured)", () => {
    mockUseFeatureFlag.mockReturnValue(undefined);
    expect(renderFlag()).toBe(false);
  });

  it("resolves to true when PostHog's hook reports the flag on", () => {
    mockUseFeatureFlag.mockReturnValue(true);
    expect(renderFlag()).toBe(true);
  });

  it("resolves to false when PostHog's hook reports the flag off", () => {
    mockUseFeatureFlag.mockReturnValue(false);
    expect(renderFlag()).toBe(false);
  });
});
