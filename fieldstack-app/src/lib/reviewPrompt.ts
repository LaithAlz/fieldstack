/**
 * App Store review prompt, gated on demonstrated value.
 *
 * Strategy: screens record "value moments" (a booking redirect, a save);
 * the next time the app becomes active with enough accumulated moments we
 * ask once, via a friendly Alert that deep-links to the App Store's
 * write-review page.
 *
 * Why a deep link and not expo-store-review: the native SKStoreReview sheet
 * needs a native module, and adding one changes the fingerprint
 * runtimeVersion — which would strand every OTA update for the binary that's
 * live today. The deep link is pure JS, so this ships over-the-air now; the
 * native sheet lands with the next binary (#437) and can replace the link
 * here without changing the gating.
 *
 * Throttles (in line with Apple's guidance — the OS enforces 3 prompts/365d
 * on the native sheet; we self-enforce the same spirit here):
 *   - needs >= MOMENTS_REQUIRED accumulated value moments
 *   - max MAX_PROMPTS lifetime prompts
 *   - min PROMPT_COOLDOWN_MS between prompts
 * Moments reset to zero after every prompt so a "Not now" isn't re-asked on
 * the next foreground.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Alert, AppState } from "react-native";

import {
  EVENT_REVIEW_PROMPT_ACCEPTED,
  EVENT_REVIEW_PROMPT_SHOWN,
  track,
} from "./analytics";

const KEY = "@fieldstack/review_prompt";

const APP_STORE_ID = "6780034337";
// itms-apps opens the App Store app directly on-device; the https form is
// the fallback (and what a simulator can at least resolve in Safari).
const WRITE_REVIEW_NATIVE = `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const WRITE_REVIEW_WEB = `https://apps.apple.com/app/onside/id${APP_STORE_ID}?action=write-review`;

export const MOMENTS_REQUIRED = 2;
export const MAX_PROMPTS = 3;
export const PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Delay after foreground before showing the Alert, so we never race the
// app-switch transition (an Alert during the transition can be dropped).
const FOREGROUND_DELAY_MS = 1200;

export type ReviewPromptState = {
  moments: number;
  promptCount: number;
  lastPromptAt: number | null;
};

const DEFAULT_STATE: ReviewPromptState = {
  moments: 0,
  promptCount: 0,
  lastPromptAt: null,
};

/** Pure eligibility check — unit-tested; all the policy lives here. */
export function isEligibleForReviewPrompt(
  state: ReviewPromptState,
  now: number
): boolean {
  if (state.moments < MOMENTS_REQUIRED) return false;
  if (state.promptCount >= MAX_PROMPTS) return false;
  if (
    state.lastPromptAt !== null &&
    now - state.lastPromptAt < PROMPT_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

export async function getReviewPromptState(): Promise<ReviewPromptState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { moments: unknown }).moments === "number" &&
      typeof (parsed as { promptCount: unknown }).promptCount === "number"
    ) {
      const p = parsed as { moments: number; promptCount: number; lastPromptAt?: unknown };
      return {
        moments: p.moments,
        promptCount: p.promptCount,
        lastPromptAt: typeof p.lastPromptAt === "number" ? p.lastPromptAt : null,
      };
    }
    return DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

async function setState(state: ReviewPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage failures degrade to "prompt logic forgets" — never crash a caller.
  }
}

/**
 * Record that the user just got real value. Weight lets strong signals
 * (a booking redirect) reach the threshold alone while weak ones (a save)
 * need repetition. Fire-and-forget safe.
 */
export async function recordReviewValueMoment(weight = 1): Promise<void> {
  const state = await getReviewPromptState();
  await setState({ ...state, moments: state.moments + weight });
}

let promptInFlight = false;

/** Check eligibility and show the prompt. Safe to call opportunistically. */
export async function maybePromptForReview(): Promise<void> {
  if (promptInFlight) return;
  promptInFlight = true;
  try {
    const state = await getReviewPromptState();
    if (!isEligibleForReviewPrompt(state, Date.now())) return;

    // Mark as prompted *before* showing: if the app dies mid-alert we'd
    // rather under-ask than double-ask.
    await setState({
      moments: 0,
      promptCount: state.promptCount + 1,
      lastPromptAt: Date.now(),
    });

    track(EVENT_REVIEW_PROMPT_SHOWN, { prompt_number: state.promptCount + 1 });
    Alert.alert(
      "Enjoying Onside?",
      "A quick rating helps other GTA players find every field.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Rate Onside",
          onPress: () => {
            track(EVENT_REVIEW_PROMPT_ACCEPTED);
            Linking.openURL(WRITE_REVIEW_NATIVE).catch(() => {
              Linking.openURL(WRITE_REVIEW_WEB).catch(() => undefined);
            });
          },
        },
      ]
    );
  } finally {
    promptInFlight = false;
  }
}

/**
 * Wire the foreground trigger. Called once at startup (inside App.tsx's
 * guarded init block). The foreground moment is deliberate: after a booking
 * redirect the user left for the operator's site, so "back in Onside" is
 * exactly the natural "how was it?" beat — and it never interrupts a task.
 */
export function initReviewPrompt(): () => void {
  const sub = AppState.addEventListener("change", (status) => {
    if (status !== "active") return;
    setTimeout(() => {
      void maybePromptForReview();
    }, FOREGROUND_DELAY_MS);
  });
  return () => sub.remove();
}
