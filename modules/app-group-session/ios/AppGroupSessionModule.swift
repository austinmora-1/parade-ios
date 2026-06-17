import ExpoModulesCore
import Foundation

// Phase B — session bridge (write side).
//
// The signed-in Parade identity needs to be visible to the iMessage extension
// (a separate process/target) so its bubble links can carry the sender's real
// share/invite codes. App Groups are the supported channel for sharing a small
// amount of data between an app and its extension.
//
// We deliberately bridge ONLY non-secret identity — userId, shareCode,
// displayName — never the Supabase access/refresh tokens. share_code is
// designed to be shared publicly; a user UUID is not a credential. The
// extension only ever READS this and builds universal links from it; it never
// makes authenticated API calls, so no token ever needs to leave the keychain.
//
// Must match: the suite id in app.config.ts (APP_GROUP), the reader in
// targets/imessage/AppGroupSession.swift, and the keys in index.ts.

private let appGroupId = "group.app.parade.ios"
private let sessionKey = "parade.session.v1"

public class AppGroupSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupSession")

    // Store / refresh the bridged identity. Called on sign-in and whenever the
    // profile's share_code / display name becomes available.
    Function("setSession") { (userId: String, shareCode: String?, displayName: String?) -> Void in
      guard let defaults = UserDefaults(suiteName: appGroupId) else {
        NSLog("[Parade] AppGroupSession: suite \(appGroupId) unavailable — check entitlements")
        return
      }
      var payload: [String: String] = ["userId": userId]
      if let shareCode, !shareCode.isEmpty { payload["shareCode"] = shareCode }
      if let displayName, !displayName.isEmpty { payload["displayName"] = displayName }

      if let data = try? JSONSerialization.data(withJSONObject: payload),
         let json = String(data: data, encoding: .utf8) {
        defaults.set(json, forKey: sessionKey)
      }
    }

    // Drop the bridged identity on sign-out so the extension falls back to its
    // signed-out state (generic links).
    Function("clearSession") { () -> Void in
      UserDefaults(suiteName: appGroupId)?.removeObject(forKey: sessionKey)
    }

    // Read-back, mainly for parity/debugging from JS. The extension uses its
    // own native reader (targets/imessage/AppGroupSession.swift).
    Function("getSession") { () -> [String: String]? in
      guard let defaults = UserDefaults(suiteName: appGroupId),
            let json = defaults.string(forKey: sessionKey),
            let data = json.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: String]
      else { return nil }
      return payload
    }
  }
}
