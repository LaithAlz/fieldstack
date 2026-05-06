import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";

import { Button } from "../../components/Button";
import { IconDisc } from "../../components/IconDisc";
import { OnboardingScaffold } from "../../components/OnboardingScaffold";
import {
  getCurrentCoords,
  requestPermission,
} from "../../lib/location";
import { setLastLocation } from "../../lib/storage";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "LocationPermission">;

export function LocationPermissionScreen({ navigation }: Props) {
  const [requesting, setRequesting] = useState(false);

  const proceed = () => navigation.navigate("SportPreference");

  const handleEnable = async () => {
    setRequesting(true);
    try {
      const status = await requestPermission();
      if (status === "granted") {
        // Best-effort coords stash; the venue list can read this on first paint.
        const coords = await getCurrentCoords();
        if (coords) await setLastLocation(coords);
      }
      // Whether granted, denied, or undetermined — we proceed. A denial here
      // is final per REQ-F1.3; the user must change it from system settings.
      proceed();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <OnboardingScaffold
      step={2}
      totalSteps={3}
      hero={<IconDisc icon="location-outline" />}
      title="See fields near you"
      body="So we can show you fields nearby and sort results by distance. Your location stays on your device."
      footer={
        <>
          <Button
            label="Enable location"
            onPress={handleEnable}
            loading={requesting}
            accessibilityHint="Opens the system permission dialog"
          />
          <Button
            label="Not now"
            variant="ghost"
            onPress={proceed}
            disabled={requesting}
            accessibilityHint="Continue without location access"
          />
        </>
      }
    />
  );
}
