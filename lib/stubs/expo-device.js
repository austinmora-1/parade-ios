/**
 * Stub for expo-device — used by Metro to satisfy `require('expo-device')`
 * without forcing the real package + a native rebuild.
 *
 * The package is optional-loaded by posthog-react-native, which reads
 * properties like `.manufacturer` / `.modelName` for analytics. Returning
 * `undefined` for everything is functionally equivalent to "we don't know
 * the device" — posthog handles this gracefully.
 *
 * If you ever do want real device info, install expo-device and remove the
 * resolver override in metro.config.js.
 */
module.exports = {
  brand:           undefined,
  manufacturer:    undefined,
  modelName:       undefined,
  modelId:         undefined,
  designName:      undefined,
  productName:     undefined,
  deviceYearClass: undefined,
  totalMemory:     undefined,
  supportedCpuArchitectures: undefined,
  osName:          undefined,
  osVersion:       undefined,
  osBuildId:       undefined,
  osInternalBuildId: undefined,
  osBuildFingerprint: undefined,
  platformApiLevel: undefined,
  deviceName:      undefined,
  isDevice:        true, // best-effort: assume real device, not simulator
  DeviceType: {
    UNKNOWN: 0,
    PHONE:   1,
    TABLET:  2,
    DESKTOP: 3,
    TV:      4,
  },
  // Async getters used by some libs
  async getDeviceTypeAsync() { return 1; },
  async getMaxMemoryAsync()  { return undefined; },
  async getUptimeAsync()      { return undefined; },
  async isRootedExperimentalAsync() { return false; },
  async isSideLoadingEnabledAsync()  { return false; },
};
