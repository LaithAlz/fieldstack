import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";

/**
 * Route → params map. Add entries here as screens land; the typed `useNavigation`
 * and `useRoute` hooks across the app pick this up automatically.
 */
export type RootStackParamList = {
  Placeholder: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Temporary screen so the navigator has at least one route to render. Delete
// the screen + this component once real screens are registered.
function PlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>FieldStack loading…</Text>
    </View>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 17,
  },
});
