import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FieldSearchProvider } from "../hooks/useFieldSearch";
import { FieldDetailScreen } from "../screens/main/FieldDetailScreen";
import { FieldSearchScreen } from "../screens/main/FieldSearchScreen";
import { MapViewScreen } from "../screens/main/MapViewScreen";
import { ProfileScreen } from "../screens/main/ProfileScreen";
import { SavedScreen } from "../screens/main/SavedScreen";
import { VenueDetailScreen } from "../screens/main/VenueDetailScreen";
import { VenueListScreen } from "../screens/main/VenueListScreen";
import { useTheme } from "../theme/useTheme";

// ---------------------------------------------------------------------------
// Param lists
// ---------------------------------------------------------------------------

// The Explore tab carries the full venue/field/search/map flow. Kept under
// the legacy `MainStackParamList` name because every screen imports it for
// typed navigation; renaming would touch ~10 files for no semantic gain.
export type MainStackParamList = {
  VenueList: undefined;
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
  FieldSearch: undefined;
  MapView: undefined;
};

// Saved + Me each get their own small stack so detail-screen pushes from
// those tabs don't disturb the Explore tab's back stack. The detail screens
// themselves are shared component imports; React Navigation treats per-stack
// registrations independently, so each tab's instance has its own history.
export type SavedStackParamList = {
  SavedList: undefined;
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
};

export type MeStackParamList = {
  Profile: undefined;
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
};

export type RootTabsParamList = {
  ExploreTab: undefined;
  SavedTab: undefined;
  MeTab: undefined;
};

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

const ExploreStack = createNativeStackNavigator<MainStackParamList>();
function ExploreStackNavigator() {
  return (
    <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
      <ExploreStack.Screen name="VenueList" component={VenueListScreen} />
      <ExploreStack.Screen name="VenueDetail" component={VenueDetailScreen} />
      <ExploreStack.Screen name="FieldDetail" component={FieldDetailScreen} />
      <ExploreStack.Screen name="FieldSearch" component={FieldSearchScreen} />
      <ExploreStack.Screen name="MapView" component={MapViewScreen} />
    </ExploreStack.Navigator>
  );
}

const SavedStack = createNativeStackNavigator<SavedStackParamList>();
function SavedStackNavigator() {
  return (
    <SavedStack.Navigator screenOptions={{ headerShown: false }}>
      <SavedStack.Screen name="SavedList" component={SavedScreen} />
      <SavedStack.Screen name="VenueDetail" component={VenueDetailScreen} />
      <SavedStack.Screen name="FieldDetail" component={FieldDetailScreen} />
    </SavedStack.Navigator>
  );
}

const MeStack = createNativeStackNavigator<MeStackParamList>();
function MeStackNavigator() {
  return (
    <MeStack.Navigator screenOptions={{ headerShown: false }}>
      <MeStack.Screen name="Profile" component={ProfileScreen} />
      <MeStack.Screen name="VenueDetail" component={VenueDetailScreen} />
      <MeStack.Screen name="FieldDetail" component={FieldDetailScreen} />
    </MeStack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root tabs
// ---------------------------------------------------------------------------

const Tabs = createBottomTabNavigator<RootTabsParamList>();

export function MainNavigator() {
  const colors = useTheme();
  return (
    <FieldSearchProvider>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        }}
      >
        <Tabs.Screen
          name="ExploreTab"
          component={ExploreStackNavigator}
          options={{
            tabBarLabel: "Explore",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="SavedTab"
          component={SavedStackNavigator}
          options={{
            tabBarLabel: "Saved",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="heart" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="MeTab"
          component={MeStackNavigator}
          options={{
            tabBarLabel: "Me",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs.Navigator>
    </FieldSearchProvider>
  );
}
