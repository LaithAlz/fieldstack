module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets/plugin must be the LAST plugin in the array.
    // It's required for Reanimated 4 + @gorhom/bottom-sheet to compile their
    // worklet-marked functions correctly.
    plugins: ["react-native-worklets/plugin"],
  };
};
