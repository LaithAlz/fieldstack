import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  getFocusedRouteNameFromRoute,
  type RouteProp,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { FieldSearchProvider } from "../hooks/useFieldSearch";
import { FieldDetailScreen } from "../screens/main/FieldDetailScreen";
import { FieldSearchScreen } from "../screens/main/FieldSearchScreen";
import { MapViewScreen } from "../screens/main/MapViewScreen";
import { ProfileScreen } from "../screens/main/ProfileScreen";
import { SavedScreen } from "../screens/main/SavedScreen";
import { SettingsScreen } from "../screens/main/SettingsScreen";
import { SignInScreen } from "../screens/main/SignInScreen";
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
  Settings: undefined;
  SignIn: undefined;
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
};

export type RootTabsParamList = {
  ExploreTab: undefined;
  SavedTab: undefined;
  MeTab: undefined;
};

/**
 * Routes a Venue/Field detail screen can navigate to. They live in all three
 * tab stacks, so typing against `MainStackParamList` would lie when mounted
 * under Saved or Me — a `navigate("FieldSearch")` call would compile but
 * crash at runtime. This subset is what the detail screens actually use.
 */
export type DetailParamList = {
  VenueDetail: { venueId: string };
  FieldDetail: { fieldId: string };
};

// Hide the tab bar on full-screen detail routes. Returns a function that
// React Navigation re-reads as `route.state` changes, so the bar slides
// back when the user pops to a list-level screen.
function tabBarStyleFor(
  route: RouteProp<RootTabsParamList, keyof RootTabsParamList>
) {
  const focused = getFocusedRouteNameFromRoute(route);
  if (
    focused === "VenueDetail" ||
    focused === "FieldDetail" ||
    focused === "Settings" ||
    focused === "SignIn"
  ) {
    return { display: "none" as const };
  }
  return undefined;
}

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
      <MeStack.Screen name="Settings" component={SettingsScreen} />
      <MeStack.Screen name="SignIn" component={SignInScreen} />
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
        }}
      >
        <Tabs.Screen
          name="ExploreTab"
          component={ExploreStackNavigator}
          options={({ route }) => ({
            tabBarLabel: "Explore",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" size={size} color={color} />
            ),
            tabBarStyle: tabBarStyleFor(route) ?? {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          })}
        />
        <Tabs.Screen
          name="SavedTab"
          component={SavedStackNavigator}
          options={({ route }) => ({
            tabBarLabel: "Saved",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="heart" size={size} color={color} />
            ),
            tabBarStyle: tabBarStyleFor(route) ?? {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          })}
        />
        <Tabs.Screen
          name="MeTab"
          component={MeStackNavigator}
          options={({ route }) => ({
            tabBarLabel: "Me",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
            tabBarStyle: tabBarStyleFor(route) ?? {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          })}
        />
      </Tabs.Navigator>
    </FieldSearchProvider>
  );
}
