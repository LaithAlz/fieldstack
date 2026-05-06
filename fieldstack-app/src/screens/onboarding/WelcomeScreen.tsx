import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/Button";
import { IconDisc } from "../../components/IconDisc";
import { OnboardingScaffold } from "../../components/OnboardingScaffold";
import { useOnboarding } from "../../lib/onboardingContext";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { fontSize, fontWeight, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  const { completeOnboarding } = useOnboarding();
  const colors = useTheme();

  const handleSkip = () => {
    void completeOnboarding();
  };

  return (
    <OnboardingScaffold
      step={1}
      totalSteps={3}
      hero={
        <View style={styles.brandStack}>
          <IconDisc icon="football" size={120} />
          <Text style={[styles.wordmark, { color: colors.textPrimary }]}>FieldStack</Text>
        </View>
      }
      title="Find pickup soccer, fast"
      body="Discover and book fields across the GTA — turf, grass, indoor, all in one place."
      footer={
        <>
          <Button label="Get started" onPress={() => navigation.navigate("LocationPermission")} />
          <Button
            label="Skip for now"
            variant="ghost"
            onPress={handleSkip}
            accessibilityHint="Skip onboarding and go straight to the venue list"
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
