module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@services': './src/services',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@types': './src/types',
            '@store': './src/store',
            '@navigation': './src/navigation',
          }
        }
      ],
      'react-native-reanimated/plugin',
    ],
    env: {
      // Release builds only. console.log in touch handlers measurably lags the
      // board, and there are ~130 calls across src. error/warn are kept so a
      // tester's logcat still explains a crash.
      production: {
        plugins: [
          ['transform-remove-console', { exclude: ['error', 'warn'] }],
        ],
      },
    },
  };
};
