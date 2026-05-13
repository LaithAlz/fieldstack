import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FieldSearchProvider } from "../hooks/useFieldSearch";
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
  // Single FieldSearchProvider above the stack so FieldSearch + Map share
  // one filter/result store (without this they'd have independent state
  // and the two screens would double-fetch).
  return (
    <FieldSearchProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="VenueList" component={VenueListScreen} />
        <Stack.Screen name="VenueDetail" component={VenueDetailScreen} />
        <Stack.Screen name="FieldDetail" component={FieldDetailScreen} />
        <Stack.Screen name="FieldSearch" component={FieldSearchScreen} />
        <Stack.Screen name="MapView" component={MapViewScreen} />
      </Stack.Navigator>
    </FieldSearchProvider>
  );
}
