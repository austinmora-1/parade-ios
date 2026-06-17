// MessagesViewController.swift
//
// Parade iMessage extension.
//
// Mirrors the in-app FAB ("What are you planning?") drawer, curated for a chat
// context: the same rows, titles, subtitles, icon accents and divider as
// app/(app)/what-planning.tsx — minus "Quick plan" (logging a past plan makes
// no sense when you're starting a fresh conversation).
//
// Per-row behavior here differs from the FAB: instead of navigating an
// in-app route, each row INSERTS a branded MSMessage bubble straight into the
// active conversation, since the whole point of the iMessage app is that
// you're already in a chat.
//
// Phase E (wired): each bubble now carries the sender's real codes when the
// user is signed in, read from the shared App Group (Phase B — see
// AppGroupSession.swift). The links are:
//   share-availability → /share/{share_code}?view=1w&src=imessage
//   add-friend         → /invite/{share_code}?src=imessage
//   find-time          → /imessage-plan?flow=find-time&inviter={userId}&src=imessage
//   find-people        → /imessage-plan?flow=find-people&inviter={userId}&src=imessage
//   go-somewhere       → /imessage-plan?flow=go-somewhere&inviter={userId}&src=imessage
// The /imessage-plan, /invite/{code} and /share/{code} routes live in the RN
// app (app/(app)/...) — they resolve the codes and create/join the right
// shared object on the recipient's device.
//
// When the user is signed out (or the app hasn't run since install so the
// bridge is empty), each row falls back to its generic `fallbackPath` so the
// bubble still opens the app to a sensible place. See `MenuOption.bubbleURL`.

import Messages
import SwiftUI
import UIKit

// MARK: - Menu model

/// One row in the Parade iMessage drawer. `title`/`subtitle` render in the
/// menu (matching the FAB); `caption`/`subcaption` render on the inserted
/// MSMessage bubble. `fallbackPath` is the generic universal-link path used
/// when the user is signed out; `bubbleURL(session:)` builds the real
/// code-bearing link when a bridged identity is available.
private struct MenuOption: Identifiable {
  let id: String
  let symbol: String       // SF Symbol mirroring the FAB's lucide icon
  let accent: Color        // icon accent, matching the FAB row
  let title: String        // menu row title (matches FAB)
  let subtitle: String     // menu row subtitle (matches FAB)
  let caption: String      // bubble caption
  let subcaption: String   // bubble subcaption
  let fallbackPath: String // signed-out helloparade.app path the bubble opens

  // Parade brand tokens (shared with ComposeView styling below).
  static let paradeGreen = Color(red: 0x23 / 255, green: 0x74 / 255, blue: 0x4D / 255)
  static let marigold = Color(red: 0xDF / 255, green: 0xA5 / 255, blue: 0x3A / 255)
  static let terracotta = Color(red: 0xD4 / 255, green: 0x65 / 255, blue: 0x49 / 255)
  // Text colors. The menu draws on fixed light surfaces (custard + white
  // cards), so we pin text to the brand's light-mode --foreground /
  // --muted-foreground rather than SwiftUI's semantic .primary/.secondary,
  // which would flip to white/gray in dark mode and wash out.
  static let ink = Color(red: 0x1E / 255, green: 0x2F / 255, blue: 0x26 / 255)        // #1E2F26 dark forest (--foreground)
  static let inkMuted = Color(red: 0x92 / 255, green: 0x92 / 255, blue: 0x98 / 255)   // #929298 elephant gray (--muted-foreground)

  /// Curated for iMessage — the FAB's five conversation-oriented flows, in the
  /// same order, with the share/invite group after the divider (see `isShare`).
  static let all: [MenuOption] = [
    MenuOption(
      id: "find-time",
      symbol: "calendar.badge.checkmark",
      accent: paradeGreen,
      title: "Find time with friends",
      subtitle: "Pick friends, see when everyone's free, and lock in a plan.",
      caption: "Let's find a time 📅",
      subcaption: "Tap to share when you're free in Parade",
      fallbackPath: "/find-time"
    ),
    MenuOption(
      id: "find-people",
      symbol: "megaphone.fill",
      accent: marigold,
      title: "Ask friends to join",
      subtitle: "Open call: 'I'm getting drinks Friday — who's in?' No invitee list needed.",
      caption: "Who's in? 📣",
      subcaption: "Open invite — tap to join in Parade",
      fallbackPath: "/find-people"
    ),
    MenuOption(
      id: "go-somewhere",
      symbol: "airplane",
      accent: paradeGreen,
      title: "Go somewhere",
      subtitle: "Plan a trip or visit — find weekends that work for everyone.",
      caption: "Let's go somewhere ✈️",
      subcaption: "Plan a trip together in Parade",
      fallbackPath: "/go-somewhere"
    ),
    // --- divider (share & invite group) ---
    MenuOption(
      id: "share-availability",
      symbol: "calendar",
      accent: paradeGreen,
      title: "Share availability",
      subtitle: "Send friends a link to when you're free — next week, month, or quarter.",
      caption: "Here's when I'm free 🗓️",
      subcaption: "Tap to see my availability in Parade",
      fallbackPath: "/share-availability"
    ),
    MenuOption(
      id: "add-friend",
      symbol: "person.badge.plus",
      accent: terracotta,
      title: "Invite friends to Parade",
      subtitle: "Share a link or find people already on the app.",
      caption: "Join me on Parade 🎉",
      subcaption: "Plan get-togethers without the back-and-forth",
      fallbackPath: "/add-friend"
    ),
  ]

  /// Rows from "Share availability" onward sit below the divider, matching the
  /// FAB's share/invite grouping.
  var isShare: Bool { id == "share-availability" || id == "add-friend" }

  /// Build the universal link this row's bubble opens. When a signed-in
  /// identity is bridged from the App Group it carries the sender's real
  /// share_code / userId; otherwise it falls back to `fallbackPath`. Always
  /// tagged `src=imessage` (the in-app share links use `src=ios`).
  func bubbleURL(session: AppGroupSession?) -> URL? {
    var components = URLComponents()
    components.scheme = "https"
    components.host = "helloparade.app"
    var query = [URLQueryItem(name: "src", value: "imessage")]

    switch id {
    case "share-availability":
      // Sender's availability share page; default to the next-week view.
      if let code = session?.shareCode, !code.isEmpty {
        components.path = "/share/\(code)"
        query.append(URLQueryItem(name: "view", value: "1w"))
      } else {
        components.path = fallbackPath
      }

    case "add-friend":
      // Invite link keyed by the sender's share_code so the recipient can
      // auto-connect back to them (see app/(app)/invite/[code].tsx).
      if let code = session?.shareCode, !code.isEmpty {
        components.path = "/invite/\(code)"
      } else {
        components.path = fallbackPath
      }

    case "find-time", "find-people", "go-somewhere":
      // Carry the sender's identity + which flow; the RN /imessage-plan route
      // creates/joins the right shared object on the recipient's device.
      if let uid = session?.userId, !uid.isEmpty {
        components.path = "/imessage-plan"
        query.append(URLQueryItem(name: "flow", value: id))
        query.append(URLQueryItem(name: "inviter", value: uid))
      } else {
        components.path = fallbackPath
      }

    default:
      components.path = fallbackPath
    }

    components.queryItems = query
    return components.url
  }
}

// MARK: - Principal class (referenced by Info.plist NSExtensionPrincipalClass)

class MessagesViewController: MSMessagesAppViewController {

  override func viewDidLoad() {
    super.viewDidLoad()
    embedMenuUI()
  }

  private func embedMenuUI() {
    let root = ParadeMenuView(
      onSelect: { [weak self] option in self?.insertBubble(for: option) }
    )
    let host = UIHostingController(rootView: root)
    addChild(host)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      host.view.topAnchor.constraint(equalTo: view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    host.didMove(toParent: self)
  }

  /// Compose a branded MSMessage bubble for the chosen flow and drop it into
  /// the active conversation. The URL carries the sender's real codes when a
  /// signed-in identity is bridged from the App Group (see `bubbleURL`).
  private func insertBubble(for option: MenuOption) {
    guard let conversation = activeConversation else { return }

    let layout = MSMessageTemplateLayout()
    layout.caption = option.caption
    layout.subcaption = option.subcaption

    let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
    message.layout = layout
    message.url = option.bubbleURL(session: AppGroupSession.current)

    conversation.insert(message) { error in
      if let error = error {
        NSLog("[Parade] insert failed: \(error.localizedDescription)")
      }
    }

    // Collapse back to compact so the user can hit send.
    requestPresentationStyle(.compact)
  }
}

// MARK: - SwiftUI menu (mirrors app/(app)/what-planning.tsx)

private struct ParadeMenuView: View {
  let onSelect: (MenuOption) -> Void

  private let custard = Color(red: 0xF8 / 255, green: 0xF0 / 255, blue: 0xE0 / 255)

  var body: some View {
    ZStack {
      custard.ignoresSafeArea()

      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("What are you planning?")
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(MenuOption.inkMuted)

          ForEach(MenuOption.all) { option in
            // Divider before the share & invite group, matching the FAB.
            if option.isShare && option.id == "share-availability" {
              Divider().padding(.vertical, 2)
            }
            MenuRow(option: option) { onSelect(option) }
          }
        }
        .padding(20)
      }
    }
  }
}

private struct MenuRow: View {
  let option: MenuOption
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: option.symbol)
          .font(.system(size: 18, weight: .semibold))
          .foregroundColor(option.accent)
          .frame(width: 44, height: 44)
          .background(option.accent.opacity(0.12))
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

        VStack(alignment: .leading, spacing: 2) {
          Text(option.title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(MenuOption.ink)
          Text(option.subtitle)
            .font(.system(size: 12))
            .foregroundColor(MenuOption.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(MenuOption.inkMuted)
      }
      .padding(14)
      .background(Color.white)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}
