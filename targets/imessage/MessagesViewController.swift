// MessagesViewController.swift
//
// Parade iMessage extension — Phase A foundation spike.
//
// Goal of this file: prove that a CUSTOM MSMessagesAppViewController (not a
// sticker pack) injected by @bacons/apple-targets appears in the iMessage
// drawer and can compose an interactive MSMessage bubble into the active
// conversation. Real plan-creation UI + backend wiring come in Phases C–E.

import Messages
import SwiftUI
import UIKit

// MARK: - Principal class (referenced by Info.plist NSExtensionPrincipalClass)

class MessagesViewController: MSMessagesAppViewController {

  override func viewDidLoad() {
    super.viewDidLoad()
    embedComposeUI()
  }

  private func embedComposeUI() {
    let root = ComposeView(
      onCreatePlan: { [weak self] in self?.insertSamplePlanBubble() }
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

  /// Phase A proof: compose a templated MSMessage bubble. In Phase E this is
  /// replaced with a real plan (id + shareCode in the URL, branded layout).
  private func insertSamplePlanBubble() {
    guard let conversation = activeConversation else { return }

    let layout = MSMessageTemplateLayout()
    layout.caption = "Let's make a plan 🎉"
    layout.subcaption = "Open Parade to pick a time"

    // The URL is where Phase E will encode the plan id / share code so the
    // recipient's tap can deep-link straight into the plan.
    var components = URLComponents()
    components.scheme = "https"
    components.host = "helloparade.app"
    components.path = "/imessage-plan"
    components.queryItems = [URLQueryItem(name: "demo", value: "1")]

    let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
    message.layout = layout
    message.url = components.url

    conversation.insert(message) { error in
      if let error = error {
        NSLog("[ParadeMessages] insert failed: \(error.localizedDescription)")
      }
    }

    // Collapse the extension back to compact after composing.
    requestPresentationStyle(.compact)
  }
}

// MARK: - SwiftUI compose UI

private struct ComposeView: View {
  let onCreatePlan: () -> Void

  // Parade brand tokens
  private let paradeGreen = Color(red: 0x23 / 255, green: 0x74 / 255, blue: 0x4D / 255)
  private let custard = Color(red: 0xF8 / 255, green: 0xF0 / 255, blue: 0xE0 / 255)

  var body: some View {
    ZStack {
      custard.ignoresSafeArea()
      VStack(spacing: 16) {
        Text("Parade")
          .font(.system(size: 28, weight: .bold, design: .serif))
          .foregroundColor(paradeGreen)

        Text("Drop a plan into this chat")
          .font(.system(size: 14, weight: .medium))
          .foregroundColor(.secondary)

        Button(action: onCreatePlan) {
          HStack(spacing: 8) {
            Image(systemName: "plus.circle.fill")
            Text("Create a plan")
              .fontWeight(.semibold)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 14)
          .background(paradeGreen)
          .foregroundColor(.white)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .padding(.horizontal, 24)
      }
      .padding()
    }
  }
}
