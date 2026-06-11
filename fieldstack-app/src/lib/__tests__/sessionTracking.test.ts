import {
  resetAnalyticsProvider,
  setAnalyticsProvider,
  type AnalyticsEvent,
  type AnalyticsProperties,
} from "../analytics";
import {
  handleAppStateChange,
  onScreenChange,
  resetSessionTrackingForTests,
} from "../sessionTracking";

type Captured = { event: AnalyticsEvent; props?: AnalyticsProperties };

const T0 = 1_750_000_000_000;
const MIN = 60 * 1000;

describe("sessionTracking", () => {
  let events: Captured[];

  beforeEach(() => {
    events = [];
    setAnalyticsProvider({
      track: (event, props) => events.push({ event, props }),
    });
    resetSessionTrackingForTests(T0);
  });

  afterEach(() => {
    resetAnalyticsProvider();
  });

  it("tracks screen transitions with the previous screen", () => {
    onScreenChange("VenueList", T0 + 1000);
    onScreenChange("VenueDetail", T0 + 5000);
    expect(events).toEqual([
      {
        event: "screen_viewed",
        props: { screen: "VenueList", previous_screen: null, session_seconds: 1 },
      },
      {
        event: "screen_viewed",
        props: { screen: "VenueDetail", previous_screen: "VenueList", session_seconds: 5 },
      },
    ]);
  });

  it("dedupes repeated reports of the same screen", () => {
    onScreenChange("VenueList", T0);
    onScreenChange("VenueList", T0 + 1000);
    onScreenChange(undefined, T0 + 2000);
    expect(events).toHaveLength(1);
  });

  it("emits the exit datapoint on background: duration, screen, breadth", () => {
    onScreenChange("VenueList", T0);
    onScreenChange("VenueDetail", T0 + 10_000);
    handleAppStateChange("background", T0 + 90_000);

    const exit = events.find((e) => e.event === "app_backgrounded");
    expect(exit?.props).toEqual({
      session_seconds: 90,
      last_screen: "VenueDetail",
      screens_viewed: 2,
    });
  });

  it("collapses iOS's active→inactive→background chain into one exit event", () => {
    handleAppStateChange("inactive", T0 + 1000);
    handleAppStateChange("background", T0 + 1100);
    expect(events.filter((e) => e.event === "app_backgrounded")).toHaveLength(1);
  });

  it("short away → foreground continues the session", () => {
    onScreenChange("VenueList", T0);
    handleAppStateChange("background", T0 + 30_000);
    handleAppStateChange("active", T0 + 30_000 + 5 * MIN);

    const back = events.find((e) => e.event === "app_foregrounded");
    expect(back?.props).toEqual({
      away_seconds: 300,
      new_session: false,
      last_screen: "VenueList",
    });

    // Session clock kept running: next screen reports elapsed from T0.
    onScreenChange("MapView", T0 + 30_000 + 5 * MIN + 1000);
    const next = events.at(-1);
    expect(next?.props).toMatchObject({ screen: "MapView", session_seconds: 331 });
  });

  it("away past the session gap starts a fresh session", () => {
    onScreenChange("VenueList", T0);
    handleAppStateChange("background", T0 + 10_000);
    const comeback = T0 + 10_000 + 45 * MIN;
    handleAppStateChange("active", comeback);

    const back = events.find((e) => e.event === "app_foregrounded");
    expect(back?.props).toMatchObject({ new_session: true, away_seconds: 2700 });

    handleAppStateChange("background", comeback + 20_000);
    const exit = events.filter((e) => e.event === "app_backgrounded").at(-1);
    // Fresh session: 20s long, screen count reset.
    expect(exit?.props).toMatchObject({ session_seconds: 20, screens_viewed: 0 });
  });
});
