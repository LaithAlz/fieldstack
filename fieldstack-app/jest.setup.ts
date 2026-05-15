// Global Jest setup. Mocks the native AsyncStorage bridge so any test that
// touches storage runs purely in JS. Use the official in-memory mock the
// AsyncStorage package ships for this purpose.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
