import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/Button";
import { IconDisc } from "../../components/IconDisc";
import { OnboardingScaffold } from "../../components/OnboardingScaffold";
import {
  getCurrentCoords,
  requestPermission,
} from "../../lib/location";
import { useOnboarding } from "../../lib/onboardingContext";
import { setLastLocation } from "../../lib/storage";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { fontSize, fontWeight, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

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
          <Text style={[styles.wordmark, { color: colors.textPrimary }]}>FieldStack</Text>
        </View>
      }
      title="Find pickup soccer, fast"
      body="Discover and book fields across the GTA — turf, grass, indoor, all in one place. Share your location so we can rank fields by distance."
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
    />
  );
}

const styles = StyleSheet.create({
  brandStack: {
    alignItems: "center",
    gap: spacing.lg,
  },
  wordmark: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
});
