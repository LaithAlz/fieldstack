import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { LocationPermissionScreen } from "../screens/onboarding/LocationPermissionScreen";
import { SportPreferenceScreen } from "../screens/onboarding/SportPreferenceScreen";
import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen";

export type OnboardingStackParamList = {
  Welcome: undefined;
  LocationPermission: undefined;
  SportPreference: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Slight default; native-stack uses a horizontal slide on iOS and a
        // bottom-up fade on Android by default — both feel correct here.
        contentStyle: { backgroundColor: "transparent" },
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />
      <Stack.Screen name="SportPreference" component={SportPreferenceScreen} />
    </Stack.Navigator>
  );
}
