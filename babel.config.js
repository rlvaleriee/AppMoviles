module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // otros plugins...
      'react-native-reanimated/plugin', // <-- ÚLTIMO
    ],
  };
};
