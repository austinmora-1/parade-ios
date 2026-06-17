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
  // `name` is the Xcode TARGET name — must stay unique so it doesn't collide
  // with the main app target ("Parade"), which would make both targets write
  // to the same build dir ("Multiple commands produce conflicting outputs").
  name: 'ParadeMessages',
  // `displayName` drives CFBundleDisplayName — this is the label shown under
  // the icon in the iMessage app drawer. THIS is the user-facing "Parade".
  displayName: 'Parade',
  // NOTE: no `icon` field. The plugin's icon generator only emits a SQUARE
  // "AppIcon" set, but iMessage extensions require an icon set literally
  // named "iMessage App Icon" with non-square sizes (the plugin hardcodes
  // ASSETCATALOG_COMPILER_APPICON_NAME = "iMessage App Icon"). We hand-author
  // that set under Assets.xcassets/ instead — committed, not generated.
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
