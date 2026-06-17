// AppGroupSession.swift
//
// Phase B — session bridge (read side, iMessage extension).
//
// Reads the signed-in Parade identity that the main app mirrors into the
// shared App Group (see modules/app-group-session on the app side). The
// extension can't reach the Supabase session directly — it's a separate
// process — so this small, non-secret identity payload is how it learns the
// sender's real share/invite codes.
//
// Only identity is bridged (userId, shareCode, displayName) — never auth
// tokens. The extension makes no authenticated calls; it just builds
// universal links. If nothing has been written (signed out, or the app hasn't
// run since install), `current` is nil and MessagesViewController falls back
// to generic links.
//
// Suite id + key MUST match the writer: app.config.ts APP_GROUP,
// modules/app-group-session/ios/AppGroupSessionModule.swift.

import Foundation

struct AppGroupSession {
  let userId: String
  let shareCode: String?
  let displayName: String?

  private static let appGroupId = "group.app.parade.ios"
  private static let sessionKey = "parade.session.v1"

  /// The currently signed-in identity, or nil when signed out / never written.
  static var current: AppGroupSession? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: sessionKey),
          let data = json.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: String],
          let userId = payload["userId"], !userId.isEmpty
    else { return nil }

    return AppGroupSession(
      userId: userId,
      shareCode: payload["shareCode"],
      displayName: payload["displayName"]
    )
  }
}
