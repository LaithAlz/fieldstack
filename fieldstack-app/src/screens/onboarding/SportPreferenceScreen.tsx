import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { IconDisc } from "../../components/IconDisc";
import { OnboardingScaffold } from "../../components/OnboardingScaffold";
import { useOnboarding } from "../../lib/onboardingContext";
import { setSportPreference } from "../../lib/storage";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { spacing } from "../../theme/tokens";
import type { FieldSize } from "../../types/api";

// `Props` is unused in the body — navigation isn't manual here because
// completing onboarding flips the RootNavigator stack. The type still
// constrains the route name to a real entry.
type Props = NativeStackScreenProps<OnboardingStackParamList, "SportPreference">;

const SIZE_OPTIONS: { value: FieldSize; label: string }[] = [
  { value: "5v5", label: "5-a-side" },
  { value: "7v7", label: "7-a-side" },
  { value: "11v11", label: "11-a-side" },
];

export function SportPreferenceScreen(_props: Props) {
  const { completeOnboarding } = useOnboarding();
  const [selected, setSelected] = useState<FieldSize[]>([]);
  const [noPreference, setNoPreference] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleSize = (value: FieldSize) => {
    // Selecting any specific size clears "No preference" — mutually exclusive
    // with the multi-select size chips.
    setNoPreference(false);
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const selectNoPreference = () => {
    setNoPreference(true);
    setSelected([]);
  };

  const finish = async (preference: FieldSize[] | null) => {
    setSubmitting(true);
    await setSportPreference(preference);
    await completeOnboarding();
  };

  const handleContinue = () => {
    void finish(noPreference || selected.length === 0 ? null : selected);
  };

  const handleSkip = () => {
    void finish(null);
  };

  return (
    <OnboardingScaffold
      step={3}
      totalSteps={3}
      onSkip={handleSkip}
      hero={<IconDisc icon="people-outline" />}
      title="What size do you play?"
      body="We'll prioritize fields that match. You can change this anytime."
      footer={
        <Button label="Continue" onPress={handleContinue} loading={submitting} />
      }
    >
      <View style={styles.chipRow}>
        {SIZE_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            selected={selected.includes(opt.value)}
            onPress={() => toggleSize(opt.value)}
          />
        ))}
      </View>
      <View style={styles.noPrefRow}>
        <Chip
          label="No preference"
          selected={noPreference}
          onPress={selectNoPreference}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  noPrefRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "center",
  },
});
