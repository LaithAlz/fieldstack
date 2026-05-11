import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FieldDetailScreen } from "../screens/main/FieldDetailScreen";
import { FieldSearchScreen } from "../screens/main/FieldSearchScreen";
import { MapViewScreen } from "../screens/main/MapViewScreen";
import { VenueDetailScreen } from "../screens/main/VenueDetailScreen";
import { VenueListScreen } from "../screens/main/VenueListScreen";

export type MainStackParamList = {
  VenueList: undefined;
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
  FieldSearch: undefined;
  MapView: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VenueList" component={VenueListScreen} />
      <Stack.Screen name="VenueDetail" component={VenueDetailScreen} />
      <Stack.Screen name="FieldDetail" component={FieldDetailScreen} />
      <Stack.Screen name="FieldSearch" component={FieldSearchScreen} />
      <Stack.Screen name="MapView" component={MapViewScreen} />
    </Stack.Navigator>
  );
}
