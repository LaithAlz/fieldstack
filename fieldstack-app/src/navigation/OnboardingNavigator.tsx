import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen";

export type OnboardingStackParamList = {
  Welcome: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
    </Stack.Navigator>
  );
}
