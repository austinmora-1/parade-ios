const path = require('path');
const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// ─── Optional-dep stubs ─────────────────────────────────────────────────────
// `expo-device` is optionally required by posthog-react-native. We don't ship
// it (would need an EAS rebuild) so we redirect Metro's resolution to a JS
// stub that returns undefined for every property. posthog handles that
// gracefully (just skips device-property analytics).
const STUB_MAP = {
  'expo-device': path.resolve(__dirname, 'lib/stubs/expo-device.js'),
};

const previousResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (STUB_MAP[moduleName]) {
      return {
        type: 'sourceFile',
        filePath: STUB_MAP[moduleName],
      };
    }
    if (previousResolveRequest) {
      return previousResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = withNativeWind(config, { input: './global.css' });