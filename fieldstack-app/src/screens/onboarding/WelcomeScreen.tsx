import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "../../components/Text";

import { Button } from "../../components/Button";
import { FadeInUp } from "../../components/FadeInUp";
import { IconDisc } from "../../components/IconDisc";
import { OnboardingScaffold } from "../../components/OnboardingScaffold";
import {
  getCurrentCoords,
  requestPermission,
} from "../../lib/location";
import { useOnboarding } from "../../lib/onboardingContext";
import { setLastLocation } from "../../lib/storage";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { fontFamily, fontSize, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

const FEATURES: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [
  { icon: "search-outline", label: "Browse every field across the GTA" },
  { icon: "options-outline", label: "Filter by surface, size, and price" },
  { icon: "navigate-outline", label: "Open the operator's booking page in one tap" },
];

type Props = NativeStackScreenProps<OnboardingStackParamList, "Welcome">;

// Single-screen onboarding: brand + value prop + location prompt. We used to
// have three screens (Welcome → LocationPermission → SportPreference) but
// the second screen carried a single CTA and the third was almost always
// skipped — too much ceremony for a discovery app.
export function WelcomeScreen(_props: Props) {
  const { completeOnboarding } = useOnboarding();
  const colors = useTheme();
  const [requesting, setRequesting] = useState(false);

  const finish = async () => {
    await completeOnboarding();
  };

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const status = await requestPermission();
      if (status === "granted") {
        const coords = await getCurrentCoords();
        if (coords) await setLastLocation(coords);
      }
      await finish();
    } finally {
      setRequesting(false);
    }
  };

  const handleSkip = () => {
    void finish();
  };

  return (
    <OnboardingScaffold
      step={1}
      totalSteps={1}
      hero={
        <View style={styles.brandStack}>
          <IconDisc icon="football" size={120} />
          <Text
            font="display"
            size="xxxl"
            weight="bold"
            style={[styles.wordmark, { color: colors.textPrimary }]}
          >
            Onside
          </Text>
        </View>
      }
      title="Find soccer fields, fast"
      body="Discover fields across the GTA in one place. Share your location so we can rank them by distance."
      footer={
        <>
          <Button
            label="Enable location"
            onPress={handleEnable}
            loading={requesting}
            accessibilityHint="Opens the system permission dialog, then takes you to the venue list"
          />
          <Button
            label="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            disabled={requesting}
            accessibilityHint="Continue without location access"
          />
        </>
      }
    >
      <View style={styles.featureList}>
        {FEATURES.map((f, i) => (
          <FadeInUp key={f.label} delay={150 + i * 110}>
            <View style={styles.featureRow}>
              <View
                style={[styles.featureIconWrap, { backgroundColor: colors.brand + "1A" }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons name={f.icon} size={18} color={colors.brand} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>
                {f.label}
              </Text>
            </View>
          </FadeInUp>
        ))}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  brandStack: {
    alignItems: "center",
    gap: spacing.lg,
  },
  wordmark: {
    // Size/weight/family come from the Text props (font="display" size="xxxl")
    // so the line height matches the glyphs — overriding fontSize here without
    // a matching lineHeight is what clipped the wordmark to "UNSIDE".
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  featureList: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
});
