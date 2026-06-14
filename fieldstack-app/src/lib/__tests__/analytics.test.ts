import {
  identify,
  reset,
  resetAnalyticsProvider,
  setAnalyticsProvider,
  track,
} from "../analytics";

describe("analytics routing", () => {
  afterEach(() => resetAnalyticsProvider());

  it("routes track / identify / reset to the active provider", () => {
    const calls: string[] = [];
    setAnalyticsProvider({
      track: (e) => calls.push(`track:${e}`),
      identify: (id) => calls.push(`identify:${id}`),
      reset: () => calls.push("reset"),
    });

    track("app_opened");
    identify("user-1", { email: "a@b.com" });
    reset();

    expect(calls).toEqual(["track:app_opened", "identify:user-1", "reset"]);
  });

  it("no-ops safely when the provider omits identify/reset", () => {
    setAnalyticsProvider({ track: () => undefined });
    expect(() => identify("user-1")).not.toThrow();
    expect(() => reset()).not.toThrow();
  });

  it("swallows provider errors so analytics never crashes callers", () => {
    setAnalyticsProvider({
      track: () => {
        throw new Error("boom");
      },
      reset: () => {
        throw new Error("boom");
      },
    });
    expect(() => track("app_opened")).not.toThrow();
    expect(() => reset()).not.toThrow();
  });
});
