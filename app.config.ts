import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_NAME = 'Parade';
const BUNDLE_ID = 'app.parade.ios';
const APPLE_TEAM_ID = '9THMCL38AJ';
const ASSOCIATED_DOMAIN = 'helloparade.app';

const PERMISSION_COPY = {
  calendar:
    "Parade reads your calendar so friends can see when you're free — without you typing it in.",
  photos: "Pick a profile photo or a memory from a plan you've kept.",
  camera:
    'Take a quick photo to remember a hangout, or update your profile picture.',
  tracking:
    'Allow Parade to use your device identifier so we can measure how the app is used and improve it.',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: 'parade-ios',
  scheme: 'parade',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#F7F2EA',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${ASSOCIATED_DOMAIN}`],
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCalendarsUsageDescription: PERMISSION_COPY.calendar,
      NSPhotoLibraryUsageDescription: PERMISSION_COPY.photos,
      NSCameraUsageDescription: PERMISSION_COPY.camera,
      NSUserTrackingUsageDescription: PERMISSION_COPY.tracking,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-web-browser',
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'react-native',
        organization: 'parade-t6',
      },
    ],
    [
      'expo-tracking-transparency',
      { userTrackingPermission: PERMISSION_COPY.tracking },
    ],
    [
      'expo-notifications',
      { color: '#DDA73A' },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PERMISSION_COPY.photos,
        cameraPermission: PERMISSION_COPY.camera,
      },
    ],
    [
      'expo-calendar',
      { calendarPermission: PERMISSION_COPY.calendar },
    ],
    'expo-splash-screen',
  ],
  extra: {
    appleTeamId: APPLE_TEAM_ID,
    associatedDomain: ASSOCIATED_DOMAIN,
    eas: { projectId: '46315e07-f0e8-4119-af99-01b8ae2109b3' },
  },
});
