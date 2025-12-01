const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  minifierPath: 'metro-minify-terser',
  minifierConfig: {
    ecma: 8,
    keep_classnames: false,
    keep_fnames: false,
    module: true,
    mangle: {
      module: true,
      keep_classnames: false,
      keep_fnames: false,
    },
    compress: {
      defaults: true,
      drop_console: true, // Elimina console.log en producción
      passes: 2,
    },
  },
};

module.exports = config;
