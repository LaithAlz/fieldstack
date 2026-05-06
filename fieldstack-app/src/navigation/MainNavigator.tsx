import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { VenueDetailScreen } from "../screens/main/VenueDetailScreen";
import { VenueListScreen } from "../screens/main/VenueListScreen";

export type MainStackParamList = {
  VenueList: undefined;
  VenueDetail: { venueId: string };
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VenueList" component={VenueListScreen} />
      <Stack.Screen name="VenueDetail" component={VenueDetailScreen} />
    </Stack.Navigator>
  );
}
