import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getReviewPromptState,
  isEligibleForReviewPrompt,
  MAX_PROMPTS,
  MOMENTS_REQUIRED,
  PROMPT_COOLDOWN_MS,
  recordReviewValueMoment,
  type ReviewPromptState,
} from "../reviewPrompt";

const NOW = 1_800_000_000_000;

function state(overrides: Partial<ReviewPromptState> = {}): ReviewPromptState {
  return { moments: 0, promptCount: 0, lastPromptAt: null, ...overrides };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("isEligibleForReviewPrompt", () => {
  it("requires the moment threshold", () => {
    expect(
      isEligibleForReviewPrompt(state({ moments: MOMENTS_REQUIRED - 1 }), NOW)
    ).toBe(false);
    expect(
      isEligibleForReviewPrompt(state({ moments: MOMENTS_REQUIRED }), NOW)
    ).toBe(true);
  });

  it("a single booking redirect (weight 2) is enough on its own", () => {
    expect(isEligibleForReviewPrompt(state({ moments: 2 }), NOW)).toBe(true);
  });

  it("stops asking after the lifetime cap", () => {
    expect(
      isEligibleForReviewPrompt(
        state({ moments: 10, promptCount: MAX_PROMPTS }),
        NOW
      )
    ).toBe(false);
  });

  it("enforces the cooldown between prompts", () => {
    const recentlyAsked = state({
      moments: 10,
      promptCount: 1,
      lastPromptAt: NOW - PROMPT_COOLDOWN_MS + 1000,
    });
    expect(isEligibleForReviewPrompt(recentlyAsked, NOW)).toBe(false);

    const cooledDown = state({
      moments: 10,
      promptCount: 1,
      lastPromptAt: NOW - PROMPT_COOLDOWN_MS - 1000,
    });
    expect(isEligibleForReviewPrompt(cooledDown, NOW)).toBe(true);
  });
});

describe("review prompt state persistence", () => {
  it("defaults to a fresh state on first read", async () => {
    expect(await getReviewPromptState()).toEqual({
      moments: 0,
      promptCount: 0,
      lastPromptAt: null,
    });
  });

  it("accumulates weighted value moments", async () => {
    await recordReviewValueMoment(2);
    await recordReviewValueMoment(1);
    expect((await getReviewPromptState()).moments).toBe(3);
  });

  it("falls back to the default on corrupted storage", async () => {
    await AsyncStorage.setItem("@fieldstack/review_prompt", "not json{");
    expect(await getReviewPromptState()).toEqual({
      moments: 0,
      promptCount: 0,
      lastPromptAt: null,
    });
  });
});
