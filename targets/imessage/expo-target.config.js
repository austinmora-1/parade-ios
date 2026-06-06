/**
 * iMessage extension target for Parade.
 *
 * Phase A (foundation spike): a custom MSMessagesAppViewController (NOT the
 * sticker-pack template) that proves the managed-Expo target injection works
 * and can insert a message bubble into a conversation.
 *
 * type: 'imessage' gives us the correct extension point
 * (com.apple.message-payload-provider) + app-extension product type. The
 * plugin's built-in template is sticker-only, so we hand-author Info.plist
 * (custom NSExtensionPrincipalClass) + MessagesViewController.swift, both of
 * which the build picks up verbatim.
 *
 * @type {import('@bacons/apple-targets').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'imessage',
  name: 'ParadeMessages',
  // Leading dot → appended to the main app bundle id → app.parade.ios.imessage
  bundleIdentifier: '.imessage',
  deploymentTarget: '16.0',
  // MSMessagesAppViewController lives in the Messages framework.
  frameworks: ['Messages'],
  // Shared App Group so the extension can read the Supabase session that the
  // main app writes (Phase B).
  entitlements: {
    'com.apple.security.application-groups': ['group.app.parade.ios'],
  },
});
