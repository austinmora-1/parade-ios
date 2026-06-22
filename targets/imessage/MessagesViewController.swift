// MessagesViewController.swift
//
// Parade iMessage extension.
//
// Drawer (compose) mirrors the in-app FAB "What are you planning?" panel, but
// limited to the two "Reach out" actions — Vibe check and Share availability —
// and instead of opening a deep link, each composes an INTERACTIVE message
// bubble the friend can act on inside Messages:
//
//   • Vibe check       → sender proposes a day + slot (+ optional note); the
//                        recipient taps the bubble and Accepts / Passes.
//   • Share availability → sender offers their real upcoming free slots (read
//                        from the App Group, mirrored by the app — see
//                        lib/availabilityBridge.ts); the recipient taps the
//                        bubble and picks one slot.
//
// Interactivity uses the standard pattern: the bubble shows a branded image;
// tapping it opens THIS extension in the recipient's Messages with the message
// as `activeConversation.selectedMessage`. We decode the payload from the
// message URL and present the matching response UI. On Accept / pick we (1)
// drop a confirmation bubble back into the chat and (2) open the Parade app via
// a deep link to record the hang request (the extension has no network/DB
// access of its own). See app/(app)/imsg.tsx.

import Messages
import SwiftUI
import UIKit

// MARK: - Brand tokens

private enum Brand {
  // SwiftUI colors
  static let green = Color(red: 0x23 / 255, green: 0x74 / 255, blue: 0x4D / 255)
  static let greenBright = Color(red: 0x3B / 255, green: 0x9B / 255, blue: 0x68 / 255)
  static let marigold = Color(red: 0xE6 / 255, green: 0xB2 / 255, blue: 0x4A / 255)
  static let custard = Color(red: 0xF8 / 255, green: 0xF0 / 255, blue: 0xE0 / 255)
  static let ink = Color(red: 0x1E / 255, green: 0x2F / 255, blue: 0x26 / 255)
  // The FAB panel: warm near-black, white hairline border, white tiles.
  static let panel = Color(red: 28 / 255, green: 26 / 255, blue: 22 / 255)
  static let panelBorder = Color.white.opacity(0.12)
  static let tile = Color.white.opacity(0.10)
  static let label = Color.white.opacity(0.5)

  // UIColors (for drawing bubble images)
  static let uiGreen = UIColor(red: 0x23 / 255, green: 0x74 / 255, blue: 0x4D / 255, alpha: 1)
  static let uiCustard = UIColor(red: 0xF8 / 255, green: 0xF0 / 255, blue: 0xE0 / 255, alpha: 1)
  static let uiInk = UIColor(red: 0x1E / 255, green: 0x2F / 255, blue: 0x26 / 255, alpha: 1)
  static let uiMarigold = UIColor(red: 0xE6 / 255, green: 0xB2 / 255, blue: 0x4A / 255, alpha: 1)
  static let uiWhite = UIColor.white
}

// MARK: - Slots (mirror lib/socialSlots.ts)

private struct ParadeSlot {
  let id: String
  let label: String
  let range: String
}

private let paradeSlots: [ParadeSlot] = [
  .init(id: "early-morning", label: "Early morning", range: "7–9am"),
  .init(id: "late-morning", label: "Late morning", range: "9am–12pm"),
  .init(id: "early-afternoon", label: "Early afternoon", range: "12–3pm"),
  .init(id: "late-afternoon", label: "Late afternoon", range: "3–6pm"),
  .init(id: "evening", label: "Evening", range: "6–10pm"),
  .init(id: "late-night", label: "Late night", range: "10pm–2am"),
]

private func slotLabel(_ id: String) -> String { paradeSlots.first { $0.id == id }?.label ?? id }
private func slotRange(_ id: String) -> String { paradeSlots.first { $0.id == id }?.range ?? "" }

/// Evenings any day, or any slot on weekends — matches lib/socialSlots.ts.
private func socialSlotIds(for date: Date) -> [String] {
  let dow = Calendar.current.component(.weekday, from: date) // 1 = Sun, 7 = Sat
  let isWeekend = dow == 1 || dow == 7
  if isWeekend { return paradeSlots.map { $0.id } }
  return ["evening", "late-night"]
}

// MARK: - Date helpers

private enum DateFmt {
  static let day: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
  }()

  static func parse(_ s: String) -> Date? { day.date(from: s) }
  static func key(_ d: Date) -> String { day.string(from: d) }

  /// "Today", "Tomorrow", or "Fri, Jun 21".
  static func friendly(_ s: String) -> String {
    guard let d = parse(s) else { return s }
    let cal = Calendar.current
    if cal.isDateInToday(d) { return "Today" }
    if cal.isDateInTomorrow(d) { return "Tomorrow" }
    let f = DateFormatter()
    f.dateFormat = "EEE, MMM d"
    return f.string(from: d)
  }
}

// MARK: - Message payload (encoded in MSMessage.url)

private struct Payload {
  enum Kind: String {
    case ping        // proposal: a specific day + slot
    case avail       // proposal: a set of offered free slots
    case pingYes     // response: recipient accepted a ping
    case availPick   // response: recipient picked a slot
    case declined    // response: recipient passed
  }

  let kind: Kind
  var fromUserId: String?
  var name: String?
  var day: String?            // yyyy-MM-dd (ping / availPick)
  var slot: String?           // slot id (ping / availPick)
  var message: String?
  var offered: [AvailabilityDay] = []   // avail proposals: offered free slots

  var isProposal: Bool { kind == .ping || kind == .avail }

  // host helloparade.app, path /imsg. Tapping the bubble opens THIS extension
  // (Messages routes interactive messages to their app, not the universal
  // link), so this URL is our private payload channel.
  func encoded() -> URL? {
    var c = URLComponents()
    c.scheme = "https"
    c.host = "helloparade.app"
    c.path = "/imsg"
    var q: [URLQueryItem] = [URLQueryItem(name: "t", value: kind.rawValue)]
    if let v = fromUserId { q.append(.init(name: "from", value: v)) }
    if let v = name { q.append(.init(name: "name", value: v)) }
    if let v = day { q.append(.init(name: "day", value: v)) }
    if let v = slot { q.append(.init(name: "slot", value: v)) }
    if let v = message, !v.isEmpty { q.append(.init(name: "msg", value: v)) }
    if !offered.isEmpty {
      // days=2026-06-21:evening,late-night;2026-06-22:evening
      let enc = offered.map { "\($0.date):\($0.slots.joined(separator: ","))" }.joined(separator: ";")
      q.append(.init(name: "days", value: enc))
    }
    q.append(.init(name: "src", value: "imessage"))
    c.queryItems = q
    return c.url
  }

  init(kind: Kind) { self.kind = kind }

  init?(url: URL?) {
    guard let url,
          let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
          c.path == "/imsg",
          let t = c.queryItems?.first(where: { $0.name == "t" })?.value,
          let k = Kind(rawValue: t)
    else { return nil }
    func q(_ n: String) -> String? { c.queryItems?.first(where: { $0.name == n })?.value }
    kind = k
    fromUserId = q("from")
    name = q("name")
    day = q("day")
    slot = q("slot")
    message = q("msg")
    if let days = q("days") {
      offered = days.split(separator: ";").compactMap { part in
        let halves = part.split(separator: ":", maxSplits: 1)
        guard halves.count == 2 else { return nil }
        let date = String(halves[0])
        let slots = halves[1].split(separator: ",").map(String.init)
        return slots.isEmpty ? nil : AvailabilityDay(date: date, slots: slots)
      }
    }
  }
}

// MARK: - Compose drafts

private struct PingDraft {
  var day: String
  var slot: String
  var message: String
}

// MARK: - Shared view model

private final class DrawerModel: ObservableObject {
  enum Mode { case compose, receivedPing, receivedAvail }
  enum ComposeScreen { case menu, ping, avail }

  @Published var mode: Mode = .compose
  @Published var screen: ComposeScreen = .menu
  @Published var payload: Payload?
  /// Whether a Parade identity is bridged from the app (App Group). When false,
  /// the compose side shows the one-time "Connect" sign-in step.
  @Published var isSignedIn = false

  var senderName: String?
  var availability: [AvailabilityDay] = []

  // Wired by the controller.
  var onSendPing: ((PingDraft) -> Void)?
  var onShareAvail: (([AvailabilityDay]) -> Void)?
  var onAcceptPing: ((Payload) -> Void)?
  var onPickSlot: ((Payload, String, String) -> Void)? // payload, day, slot
  var onPass: ((Payload) -> Void)?
  var onConnect: (() -> Void)?
  var requestExpand: (() -> Void)?
}

// MARK: - Principal class (referenced by Info.plist NSExtensionPrincipalClass)

class MessagesViewController: MSMessagesAppViewController {

  private let model = DrawerModel()
  private var host: UIHostingController<RootView>?

  override func viewDidLoad() {
    super.viewDidLoad()
    // Opaque base matching RootView's panel so there's never a flash of the
    // system background behind the SwiftUI content.
    view.backgroundColor = UIColor(red: 28 / 255, green: 26 / 255, blue: 22 / 255, alpha: 1)
    wireModel()
    embedHost()
  }

  override func willBecomeActive(with conversation: MSConversation) {
    super.willBecomeActive(with: conversation)
    refresh(for: conversation)
  }

  override func didSelect(_ message: MSMessage, conversation: MSConversation) {
    super.didSelect(message, conversation: conversation)
    refresh(for: conversation)
  }

  // MARK: Model wiring

  private func wireModel() {
    model.requestExpand = { [weak self] in self?.requestPresentationStyle(.expanded) }
    model.onSendPing = { [weak self] draft in self?.insertPing(draft) }
    model.onShareAvail = { [weak self] days in self?.insertAvailability(days) }
    model.onAcceptPing = { [weak self] p in self?.respondAcceptPing(p) }
    model.onPickSlot = { [weak self] p, day, slot in self?.respondPickSlot(p, day: day, slot: slot) }
    model.onPass = { [weak self] p in self?.respondPass(p) }
    model.onConnect = { [weak self] in self?.openConnect() }
  }

  private func embedHost() {
    let h = UIHostingController(rootView: RootView(model: model))
    addChild(h)
    // Plain frame + autoresizing (not Auto Layout) — this reliably fills the
    // MSMessagesAppViewController's view; constraint-based hosting can render
    // blank in an iMessage extension on device.
    h.view.frame = view.bounds
    h.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    h.view.backgroundColor = .clear
    view.addSubview(h.view)
    h.didMove(toParent: self)
    host = h
  }

  /// Decide compose vs. respond based on whether the user tapped one of our
  /// proposal bubbles. Refreshes the bridged availability + sender name too.
  private func refresh(for conversation: MSConversation) {
    model.isSignedIn = AppGroupSession.current != nil
    model.senderName = AppGroupSession.current?.displayName
    model.availability = AppGroupSession.availability

    if let selected = conversation.selectedMessage,
       let payload = Payload(url: selected.url), payload.isProposal {
      model.payload = payload
      model.mode = (payload.kind == .ping) ? .receivedPing : .receivedAvail
      requestPresentationStyle(.expanded)
    } else {
      model.payload = nil
      model.mode = .compose
      model.screen = .menu
    }
  }

  // MARK: Bubble composition

  private func insertPing(_ draft: PingDraft) {
    let name = model.senderName ?? "A friend"
    var p = Payload(kind: .ping)
    p.fromUserId = AppGroupSession.current?.userId
    p.name = name
    p.day = draft.day
    p.slot = draft.slot
    p.message = draft.message.trimmingCharacters(in: .whitespacesAndNewlines)

    let layout = MSMessageTemplateLayout()
    layout.image = BubbleImage.ping(name: name, day: draft.day, slot: draft.slot,
                                     message: p.message ?? "")
    layout.caption = "👋 \(name) wants to hang"
    layout.subcaption = "\(DateFmt.friendly(draft.day)) · \(slotLabel(draft.slot)) (\(slotRange(draft.slot)))"
    insert(payload: p, layout: layout)
  }

  private func insertAvailability(_ days: [AvailabilityDay]) {
    let name = model.senderName ?? "A friend"
    var p = Payload(kind: .avail)
    p.fromUserId = AppGroupSession.current?.userId
    p.name = name
    p.offered = days

    let layout = MSMessageTemplateLayout()
    layout.image = BubbleImage.availability(name: name, days: days)
    layout.caption = "🗓️ \(name) shared their free time"
    let slotCount = days.reduce(0) { $0 + $1.slots.count }
    layout.subcaption = "Tap to pick one of \(slotCount) open slot\(slotCount == 1 ? "" : "s")"
    insert(payload: p, layout: layout)
  }

  private func insert(payload: Payload, layout: MSMessageTemplateLayout) {
    guard let conversation = activeConversation else { return }
    let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
    message.layout = layout
    message.url = payload.encoded()
    conversation.insert(message) { error in
      if let error = error { NSLog("[Parade] insert failed: \(error.localizedDescription)") }
    }
    requestPresentationStyle(.compact)
  }

  // MARK: Responses (recipient side)

  private func respondAcceptPing(_ p: Payload) {
    let me = AppGroupSession.current?.displayName ?? "Your friend"
    var r = Payload(kind: .pingYes)
    r.name = me
    r.day = p.day
    r.slot = p.slot

    let layout = MSMessageTemplateLayout()
    layout.image = BubbleImage.response(title: "\(me) is in! 🎉",
                                        detail: "\(DateFmt.friendly(p.day ?? "")) · \(slotLabel(p.slot ?? ""))")
    layout.caption = "✅ \(me) accepted"
    layout.subcaption = "\(DateFmt.friendly(p.day ?? "")) · \(slotLabel(p.slot ?? ""))"
    insertResponse(layout: layout, payload: r)

    // Record in-app: the accepter confirms the hang with the original sender.
    openApp(do: "accept-ping", from: p.fromUserId, name: p.name, day: p.day, slot: p.slot,
            message: p.message)
  }

  private func respondPickSlot(_ p: Payload, day: String, slot: String) {
    let me = AppGroupSession.current?.displayName ?? "Your friend"
    var r = Payload(kind: .availPick)
    r.name = me
    r.day = day
    r.slot = slot

    let layout = MSMessageTemplateLayout()
    layout.image = BubbleImage.response(title: "\(me) picked a time",
                                        detail: "\(DateFmt.friendly(day)) · \(slotLabel(slot))")
    layout.caption = "📌 \(me) picked a time"
    layout.subcaption = "\(DateFmt.friendly(day)) · \(slotLabel(slot)) (\(slotRange(slot)))"
    insertResponse(layout: layout, payload: r)

    openApp(do: "pick-avail", from: p.fromUserId, name: p.name, day: day, slot: slot, message: nil)
  }

  private func respondPass(_ p: Payload) {
    // A pass stays private — just collapse back to the chat without inserting.
    requestPresentationStyle(.compact)
    model.mode = .compose
    model.screen = .menu
  }

  private func insertResponse(layout: MSMessageTemplateLayout, payload: Payload) {
    guard let conversation = activeConversation else { return }
    let message = MSMessage(session: conversation.selectedMessage?.session ?? MSSession())
    message.layout = layout
    message.url = payload.encoded()
    conversation.insert(message) { error in
      if let error = error { NSLog("[Parade] response insert failed: \(error.localizedDescription)") }
    }
    requestPresentationStyle(.compact)
  }

  /// Open the Parade app to actually record the hang request (the extension
  /// can't write to Supabase). Handled by app/(app)/imsg.tsx.
  private func openApp(do action: String, from: String?, name: String?, day: String?,
                       slot: String?, message: String?) {
    var c = URLComponents()
    c.scheme = "https"
    c.host = "helloparade.app"
    c.path = "/imsg"
    var q: [URLQueryItem] = [URLQueryItem(name: "do", value: action), .init(name: "src", value: "imessage")]
    if let v = from { q.append(.init(name: "from", value: v)) }
    if let v = name { q.append(.init(name: "name", value: v)) }
    if let v = day { q.append(.init(name: "day", value: v)) }
    if let v = slot { q.append(.init(name: "slot", value: v)) }
    if let v = message, !v.isEmpty { q.append(.init(name: "msg", value: v)) }
    c.queryItems = q
    guard let url = c.url else { return }
    extensionContext?.open(url) { ok in
      if !ok { NSLog("[Parade] failed to open app for \(action)") }
    }
  }

  /// One-time connect: open the Parade app to sign in, which writes the user's
  /// identity + availability into the App Group (creating the shared container)
  /// so the extension can show real data. Handled by app/(app)/imsg-connect.tsx.
  private func openConnect() {
    var c = URLComponents()
    c.scheme = "https"
    c.host = "helloparade.app"
    c.path = "/imsg-connect"
    c.queryItems = [URLQueryItem(name: "src", value: "imessage")]
    guard let url = c.url else { return }
    extensionContext?.open(url) { ok in
      if !ok { NSLog("[Parade] failed to open app to connect") }
    }
  }
}

// MARK: - Root view (switches compose vs. received)

private struct RootView: View {
  @ObservedObject var model: DrawerModel

  var body: some View {
    ZStack {
      Brand.panel.ignoresSafeArea()
      switch model.mode {
      case .compose:
        ComposeRoot(model: model)
      case .receivedPing:
        if let p = model.payload { ReceivedPingView(model: model, payload: p) }
      case .receivedAvail:
        if let p = model.payload { ReceivedAvailabilityView(model: model, payload: p) }
      }
    }
  }
}

// MARK: - Compose: drawer + composers

private struct ComposeRoot: View {
  @ObservedObject var model: DrawerModel

  var body: some View {
    if model.isSignedIn {
      composers
    } else {
      ConnectView(onConnect: { model.onConnect?() })
    }
  }

  @ViewBuilder private var composers: some View {
    switch model.screen {
    case .menu:
      DrawerMenu(
        onQuickPing: { model.requestExpand?(); model.screen = .ping },
        onShareAvail: { model.requestExpand?(); model.screen = .avail }
      )
    case .ping:
      QuickPingComposer(
        onBack: { model.screen = .menu },
        onSend: { model.onSendPing?($0); model.screen = .menu }
      )
    case .avail:
      ShareAvailabilityComposer(
        availability: model.availability,
        onBack: { model.screen = .menu },
        onShare: { model.onShareAvail?($0); model.screen = .menu }
      )
    }
  }
}

/// One-time sign-in step shown when no Parade identity is bridged yet. The
/// extension can't authenticate itself (no network by design), so it hands off
/// to the app, which signs in and writes identity + availability to the App
/// Group. See app/(app)/imsg-connect.tsx.
private struct ConnectView: View {
  let onConnect: () -> Void
  var body: some View {
    VStack(spacing: 12) {
      Text("Parade")
        .font(.system(size: 22, weight: .bold, design: .serif))
        .foregroundColor(Brand.marigold)
      Text("Connect your account")
        .font(.system(size: 17, weight: .bold)).foregroundColor(.white)
      Text("Sign in once to send pings and share your real availability from Messages.")
        .font(.system(size: 12)).foregroundColor(Brand.label)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      PrimaryButton(title: "Open Parade to sign in", action: onConnect)
        .padding(.top, 4)
    }
    .padding(20)
    .frame(maxWidth: 360)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// The two-row "Reach out" panel, matching app/(app)/what-planning.tsx.
private struct DrawerMenu: View {
  let onQuickPing: () -> Void
  let onShareAvail: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("REACH OUT")
        .font(.system(size: 10, weight: .semibold))
        .tracking(1.5)
        .foregroundColor(Brand.label)
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 2)

      DrawerRow(symbol: "hand.wave.fill", title: "Vibe check", action: onQuickPing)
      DrawerRow(symbol: "calendar", title: "Share availability", action: onShareAvail)
    }
    .padding(8)
    .frame(maxWidth: 320, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .stroke(Brand.panelBorder, lineWidth: 1)
    )
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

private struct DrawerRow: View {
  let symbol: String
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: symbol)
          .font(.system(size: 18, weight: .medium))
          .foregroundColor(Brand.marigold)
          .frame(width: 36, height: 36)
          .background(Brand.tile)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        Text(title)
          .font(.system(size: 15, weight: .medium))
          .foregroundColor(.white)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 10)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

private struct QuickPingComposer: View {
  let onBack: () -> Void
  let onSend: (PingDraft) -> Void

  @State private var selectedDay: String = DateFmt.key(Date())
  @State private var selectedSlot: String = "evening"
  @State private var message: String = ""

  private var dayOptions: [String] {
    (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
      .map { DateFmt.key($0) }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        ComposerHeader(title: "Vibe check", subtitle: "Suggest a time to hang.", onBack: onBack)

        SectionLabel("WHEN")
        ChipRow(items: dayOptions, selected: selectedDay, label: { DateFmt.friendly($0) }) {
          selectedDay = $0
        }

        SectionLabel("TIME")
        FlowChips(items: paradeSlots.map { $0.id }, selected: [selectedSlot],
                  label: { slotLabel($0) }) { selectedSlot = $0 }

        SectionLabel("NOTE (OPTIONAL)")
        TextField("Drinks at that new place? ☕", text: $message, axis: .vertical)
          .font(.system(size: 14))
          .foregroundColor(.white)
          .padding(12)
          .background(Brand.tile)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .lineLimit(1...3)

        PrimaryButton(title: "Send ping") {
          onSend(PingDraft(day: selectedDay, slot: selectedSlot, message: message))
        }
      }
      .padding(20)
    }
  }
}

/// "Share availability" — mirrors the in-app "Find time → When works?" step:
/// a Mon-aligned calendar whose day cells are tinted by how free the user is
/// (green = lots free, marigold = some). A range toggle (1 week / 4 weeks /
/// 2 months) zooms the calendar out. In the 1-week view tapping a day fine-tunes
/// individual slots; the longer views toggle whole days in/out. Pre-loaded: the
/// user's free social slots (real bridged availability, or a social-slot
/// fallback before the first sync) are all pre-selected.
private enum ShareRange: CaseIterable {
  case week, fourWeeks, twoMonths
  var days: Int { switch self { case .week: return 7; case .fourWeeks: return 28; case .twoMonths: return 60 } }
  var label: String { switch self { case .week: return "1 week"; case .fourWeeks: return "4 weeks"; case .twoMonths: return "2 months" } }
  /// Per-slot fine-tuning is only offered in the 1-week view.
  var slotLevel: Bool { self == .week }
  var cellHeight: CGFloat { switch self { case .week: return 40; case .fourWeeks: return 34; case .twoMonths: return 28 } }
}

private struct ShareAvailabilityComposer: View {
  let availability: [AvailabilityDay]
  let onBack: () -> Void
  let onShare: ([AvailabilityDay]) -> Void

  @State private var range: ShareRange = .week
  @State private var selected: [String: Set<String>] = [:]
  @State private var activeDate: String = ""
  @State private var collapsedMonths: Set<String> = []
  @State private var seeded = false

  /// Every free day we know about (out to the longest range), real or fallback.
  private var allCandidates: [AvailabilityDay] {
    let base = availability.isEmpty
      ? (0..<63).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
          .map { AvailabilityDay(date: DateFmt.key($0), slots: socialSlotIds(for: $0)) }
      : availability
    return base.filter { !$0.slots.isEmpty }
  }

  /// Free days within the currently-selected range.
  private var candidates: [AvailabilityDay] {
    let cal = Calendar.current
    let cutoff = cal.date(byAdding: .day, value: range.days, to: cal.startOfDay(for: Date()))!
    return allCandidates.filter { (DateFmt.parse($0.date) ?? .distantFuture) < cutoff }
  }

  private var byDate: [String: [String]] {
    Dictionary(candidates.map { ($0.date, $0.slots) }, uniquingKeysWith: { a, _ in a })
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        ComposerHeader(title: "Share availability",
                       subtitle: range.slotLevel
                         ? "Tap a day to fine-tune your free times."
                         : "Tap days to toggle what you share.",
                       onBack: onBack)

        RangeSelector(range: $range)
        AvailLegend()

        if range.slotLevel {
          WeekdayHeader()
          CalendarGrid(weeks: weeks, byDate: byDate, selected: selected,
                       activeDate: activeDate, cellHeight: range.cellHeight) { onTapDay($0) }

          if let slots = byDate[activeDate] {
            DayDetail(dateKey: activeDate, slots: slots, selected: selected[activeDate] ?? []) {
              toggle(activeDate, $0)
            }
          }
        } else {
          // Longer ranges: month-grouped, collapsible, day-level toggling.
          ForEach(monthBuckets, id: \.id) { bucket in
            MonthSection(
              title: bucket.title,
              weeks: bucket.weeks,
              byDate: byDate,
              selected: selected,
              expanded: !collapsedMonths.contains(bucket.id),
              cellHeight: range.cellHeight,
              onToggleExpand: { toggleMonth(bucket.id) },
              onTapDay: { toggleWholeDay($0) }
            )
          }
        }

        PrimaryButton(title: "Share availability", disabled: !hasSelection) {
          onShare(buildSelection())
        }
      }
      .padding(20)
    }
    .onAppear(perform: seed)
  }

  private var hasSelection: Bool {
    candidates.contains { !(selected[$0.date] ?? []).isEmpty }
  }

  /// Mon-aligned weeks spanning today → the end of the range (1-week view).
  private var weeks: [[Date]] {
    let cal = Calendar.current
    let today = cal.startOfDay(for: Date())
    let last = cal.date(byAdding: .day, value: range.days - 1, to: today)!
    func mondayOffset(_ d: Date) -> Int { (cal.component(.weekday, from: d) + 5) % 7 }
    let start = cal.date(byAdding: .day, value: -mondayOffset(today), to: today)!
    var out: [[Date]] = []
    var cursor = start
    repeat {
      let week = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: cursor) }
      out.append(week)
      cursor = cal.date(byAdding: .day, value: 7, to: cursor)!
    } while cursor <= last && out.count < 10
    return out
  }

  /// One MonthBucket per calendar month the range touches (4-week / 2-month).
  private var monthBuckets: [MonthBucket] {
    let cal = Calendar.current
    let today = cal.startOfDay(for: Date())
    let cutoff = cal.date(byAdding: .day, value: range.days - 1, to: today)!
    let fmt = DateFormatter()
    fmt.dateFormat = "LLLL yyyy"
    var out: [MonthBucket] = []
    var cursor = cal.date(from: cal.dateComponents([.year, .month], from: today))!
    while cursor <= cutoff && out.count < 4 {
      let comps = cal.dateComponents([.year, .month], from: cursor)
      let id = String(format: "%04d-%02d", comps.year ?? 0, comps.month ?? 0)
      out.append(MonthBucket(id: id, title: fmt.string(from: cursor), weeks: monthWeeks(of: cursor)))
      cursor = cal.date(byAdding: .month, value: 1, to: cursor)!
    }
    return out
  }

  /// Mon-aligned weeks for a month; non-month cells are nil padding.
  private func monthWeeks(of monthDate: Date) -> [[Date?]] {
    let cal = Calendar.current
    let first = cal.date(from: cal.dateComponents([.year, .month], from: monthDate))!
    let daysInMonth = cal.range(of: .day, in: .month, for: first)?.count ?? 30
    let lead = (cal.component(.weekday, from: first) + 5) % 7   // Mon=0
    var cells: [Date?] = Array(repeating: nil, count: lead)
    for d in 0..<daysInMonth { cells.append(cal.date(byAdding: .day, value: d, to: first)) }
    while cells.count % 7 != 0 { cells.append(nil) }
    return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<($0 + 7)]) }
  }

  private func onTapDay(_ key: String) {
    guard byDate[key] != nil else { return }
    if range.slotLevel {
      activeDate = key            // open the slot detail
    } else {
      toggleWholeDay(key)         // include / exclude the whole day
    }
  }

  private func toggleMonth(_ id: String) {
    if collapsedMonths.contains(id) { collapsedMonths.remove(id) } else { collapsedMonths.insert(id) }
  }

  private func seed() {
    guard !seeded else { return }
    seeded = true
    var s: [String: Set<String>] = [:]
    for c in allCandidates { s[c.date] = Set(c.slots) }   // pre-select all free slots
    selected = s
    activeDate = allCandidates.first?.date ?? DateFmt.key(Date())
  }

  private func toggle(_ date: String, _ slot: String) {
    var set = selected[date] ?? []
    if set.contains(slot) { set.remove(slot) } else { set.insert(slot) }
    selected[date] = set
  }

  private func toggleWholeDay(_ date: String) {
    if (selected[date] ?? []).isEmpty {
      selected[date] = Set(byDate[date] ?? [])
    } else {
      selected[date] = []
    }
  }

  private func buildSelection() -> [AvailabilityDay] {
    candidates.compactMap { c in
      let picked = c.slots.filter { (selected[c.date] ?? []).contains($0) }
      return picked.isEmpty ? nil : AvailabilityDay(date: c.date, slots: picked)
    }
  }
}

private struct RangeSelector: View {
  @Binding var range: ShareRange
  var body: some View {
    HStack(spacing: 6) {
      ForEach(ShareRange.allCases, id: \.self) { r in
        Button { range = r } label: {
          Text(r.label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(range == r ? Brand.ink : .white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(range == r ? Brand.marigold : Brand.tile)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
      }
    }
  }
}

/// Heat legend: explains the availability colors + that tapping toggles sharing.
private struct AvailLegend: View {
  var body: some View {
    HStack(spacing: 12) {
      swatch(Brand.green, "Lots free")
      swatch(Brand.marigold, "Some")
      Spacer()
      Text("Tap to toggle").font(.system(size: 10)).foregroundColor(Brand.label)
    }
  }
  @ViewBuilder private func swatch(_ color: Color, _ text: String) -> some View {
    HStack(spacing: 4) {
      RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 10, height: 10)
      Text(text).font(.system(size: 10)).foregroundColor(Brand.label)
    }
  }
}

private struct WeekdayHeader: View {
  private let labels = ["M", "T", "W", "T", "F", "S", "S"]
  var body: some View {
    HStack(spacing: 6) {
      ForEach(0..<7, id: \.self) { i in
        Text(labels[i])
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(Brand.label)
          .frame(maxWidth: .infinity)
      }
    }
  }
}

private struct CalendarGrid: View {
  let weeks: [[Date]]
  let byDate: [String: [String]]
  let selected: [String: Set<String>]
  let activeDate: String
  let cellHeight: CGFloat
  let onTap: (String) -> Void

  var body: some View {
    VStack(spacing: 6) {
      ForEach(0..<weeks.count, id: \.self) { wi in
        HStack(spacing: 6) {
          ForEach(weeks[wi], id: \.self) { date in
            let key = DateFmt.key(date)
            let tappable = byDate[key] != nil
            DayCell(
              date: date,
              freeCount: byDate[key]?.count ?? 0,
              isSelected: tappable && !(selected[key] ?? []).isEmpty,
              tappable: tappable,
              isActive: key == activeDate,
              height: cellHeight
            )
            .frame(maxWidth: .infinity)
            .onTapGesture { if tappable { onTap(key) } }
          }
        }
      }
    }
  }
}

/// A day cell encoding TWO dimensions:
///   • availability heat (your real free time): green = lots free (3+ slots),
///     marigold = some (1–2), faint = busy/none.
///   • sharing toggle: full-strength heat = sharing this day, faded heat =
///     free but toggled off. Tapping toggles between the two.
private struct DayCell: View {
  let date: Date
  let freeCount: Int     // availability heat
  let isSelected: Bool   // sharing this day
  let tappable: Bool     // has free slots in range → can be toggled
  let isActive: Bool     // 1-week view: this day's slot detail is open
  let height: CGFloat

  private var fontSize: CGFloat { height >= 38 ? 14 : (height >= 32 ? 13 : 11) }
  private var isMarigold: Bool { freeCount >= 1 && freeCount < 3 }
  private var heat: Color { freeCount >= 3 ? Brand.green : (freeCount >= 1 ? Brand.marigold : Color.white) }
  private var fill: Color {
    guard tappable else { return Color.white.opacity(0.04) }   // busy / no availability
    return isSelected ? heat : heat.opacity(0.22)              // sharing = full, off = faded
  }
  private var fg: Color {
    guard tappable else { return Color.white.opacity(0.25) }
    if !isSelected { return Color.white.opacity(0.75) }
    return isMarigold ? Brand.ink : .white
  }

  var body: some View {
    Text("\(Calendar.current.component(.day, from: date))")
      .font(.system(size: fontSize, weight: .semibold))
      .foregroundColor(fg)
      .frame(height: height)
      .frame(maxWidth: .infinity)
      .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(fill))
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(isActive ? Color.white : Color.clear, lineWidth: 2)
      )
  }
}

/// One calendar month's worth of Mon-aligned weeks (nil = padding cell).
private struct MonthBucket {
  let id: String
  let title: String
  let weeks: [[Date?]]
}

/// A collapsible month section (4-week / 2-month ranges): a "June 2026" header
/// with a sharing/total day count and a chevron, over that month's calendar.
/// Days are day-level toggles (color = sharing).
private struct MonthSection: View {
  let title: String
  let weeks: [[Date?]]
  let byDate: [String: [String]]
  let selected: [String: Set<String>]
  let expanded: Bool
  let cellHeight: CGFloat
  let onToggleExpand: () -> Void
  let onTapDay: (String) -> Void

  private var dates: [Date] { weeks.flatMap { $0 }.compactMap { $0 } }
  private var availDays: Int { dates.filter { byDate[DateFmt.key($0)] != nil }.count }
  private var sharingDays: Int {
    dates.filter { byDate[DateFmt.key($0)] != nil && !(selected[DateFmt.key($0)] ?? []).isEmpty }.count
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Button(action: onToggleExpand) {
        HStack(spacing: 8) {
          Text(title).font(.system(size: 15, weight: .bold)).foregroundColor(.white)
          Spacer()
          if availDays > 0 {
            Text("\(sharingDays)/\(availDays) days")
              .font(.system(size: 12)).foregroundColor(Brand.label)
          }
          Image(systemName: expanded ? "chevron.up" : "chevron.down")
            .font(.system(size: 12, weight: .semibold)).foregroundColor(Brand.label)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if expanded {
        WeekdayHeader()
        VStack(spacing: 6) {
          ForEach(0..<weeks.count, id: \.self) { wi in
            HStack(spacing: 6) {
              ForEach(0..<7, id: \.self) { di in
                if let date = weeks[wi][di] {
                  let key = DateFmt.key(date)
                  let tappable = byDate[key] != nil
                  DayCell(date: date,
                          freeCount: byDate[key]?.count ?? 0,
                          isSelected: tappable && !(selected[key] ?? []).isEmpty,
                          tappable: tappable,
                          isActive: false,
                          height: cellHeight)
                    .frame(maxWidth: .infinity)
                    .onTapGesture { if tappable { onTapDay(key) } }
                } else {
                  Color.clear.frame(height: cellHeight).frame(maxWidth: .infinity)
                }
              }
            }
          }
        }
      }
    }
    .padding(.bottom, 2)
  }
}

private struct DayDetail: View {
  let dateKey: String
  let slots: [String]
  let selected: Set<String>
  let toggle: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(DateFmt.friendly(dateKey))
        .font(.system(size: 15, weight: .bold))
        .foregroundColor(.white)
      ForEach(slots, id: \.self) { slot in
        let on = selected.contains(slot)
        Button { toggle(slot) } label: {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(slotLabel(slot)).font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
              Text(slotRange(slot)).font(.system(size: 12)).foregroundColor(Brand.label)
            }
            Spacer()
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
              .font(.system(size: 20))
              .foregroundColor(on ? Brand.greenBright : Brand.label)
          }
          .padding(12)
          .background(on ? Brand.green.opacity(0.18) : Brand.tile)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.white.opacity(0.04))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

// MARK: - Received (recipient) views

private struct ReceivedPingView: View {
  @ObservedObject var model: DrawerModel
  let payload: Payload

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        BrandHeader()
        Text("\(payload.name ?? "A friend") wants to hang")
          .font(.system(size: 20, weight: .bold))
          .foregroundColor(.white)

        ProposalCard {
          row("calendar", DateFmt.friendly(payload.day ?? ""))
          row("clock", "\(slotLabel(payload.slot ?? "")) · \(slotRange(payload.slot ?? ""))")
          if let m = payload.message, !m.isEmpty { row("text.bubble", m) }
        }

        PrimaryButton(title: "Accept") { model.onAcceptPing?(payload) }
        SecondaryButton(title: "Pass") { model.onPass?(payload) }
      }
      .padding(20)
    }
  }

  @ViewBuilder private func row(_ symbol: String, _ text: String) -> some View {
    HStack(spacing: 10) {
      Image(systemName: symbol).foregroundColor(Brand.marigold).frame(width: 20)
      Text(text).font(.system(size: 15)).foregroundColor(.white)
      Spacer()
    }
  }
}

private struct ReceivedAvailabilityView: View {
  @ObservedObject var model: DrawerModel
  let payload: Payload

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        BrandHeader()
        Text("\(payload.name ?? "A friend") is free at")
          .font(.system(size: 20, weight: .bold))
          .foregroundColor(.white)
        Text("Pick a time that works for you.")
          .font(.system(size: 13))
          .foregroundColor(Brand.label)

        ForEach(payload.offered, id: \.date) { day in
          VStack(alignment: .leading, spacing: 8) {
            SectionLabel(DateFmt.friendly(day.date).uppercased())
            ForEach(day.slots, id: \.self) { slot in
              Button {
                model.onPickSlot?(payload, day.date, slot)
              } label: {
                HStack {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(slotLabel(slot)).font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                    Text(slotRange(slot)).font(.system(size: 12)).foregroundColor(Brand.label)
                  }
                  Spacer()
                  Image(systemName: "chevron.right").foregroundColor(Brand.marigold)
                }
                .padding(14)
                .background(Brand.tile)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .padding(20)
    }
  }
}

// MARK: - Shared UI bits

private struct ComposerHeader: View {
  let title: String
  let subtitle: String
  let onBack: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: onBack) {
        HStack(spacing: 4) {
          Image(systemName: "chevron.left")
          Text("Back")
        }
        .font(.system(size: 14, weight: .medium))
        .foregroundColor(Brand.marigold)
      }
      .buttonStyle(.plain)
      Text(title).font(.system(size: 22, weight: .bold)).foregroundColor(.white)
      Text(subtitle).font(.system(size: 13)).foregroundColor(Brand.label)
    }
  }
}

private struct BrandHeader: View {
  var body: some View {
    Text("Parade")
      .font(.system(size: 22, weight: .bold, design: .serif))
      .foregroundColor(Brand.marigold)
  }
}

private struct SectionLabel: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold))
      .tracking(1.5)
      .foregroundColor(Brand.label)
  }
}

private struct ProposalCard<Content: View>: View {
  @ViewBuilder let content: () -> Content
  var body: some View {
    VStack(alignment: .leading, spacing: 12) { content() }
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Brand.tile)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}

private struct ChipRow: View {
  let items: [String]
  let selected: String
  let label: (String) -> String
  let onTap: (String) -> Void
  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(items, id: \.self) { item in
          Chip(text: label(item), isOn: item == selected) { onTap(item) }
        }
      }
    }
  }
}

private struct FlowChips: View {
  let items: [String]
  let selected: Set<String>
  let label: (String) -> String
  let onTap: (String) -> Void
  // Simple two-column grid keeps layout predictable in the cramped extension.
  private let columns = [GridItem(.flexible()), GridItem(.flexible())]
  var body: some View {
    LazyVGrid(columns: columns, spacing: 8) {
      ForEach(items, id: \.self) { item in
        Chip(text: label(item), isOn: selected.contains(item)) { onTap(item) }
          .frame(maxWidth: .infinity)
      }
    }
  }
}

private struct Chip: View {
  let text: String
  let isOn: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(text)
        .font(.system(size: 13, weight: .medium))
        .foregroundColor(isOn ? Brand.ink : .white)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity)
        .background(isOn ? Brand.marigold : Brand.tile)
        .clipShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

private struct PrimaryButton: View {
  let title: String
  var disabled: Bool = false
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(disabled ? Brand.green.opacity(0.4) : Brand.green)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(disabled)
  }
}

private struct SecondaryButton: View {
  let title: String
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 15, weight: .medium))
        .foregroundColor(Brand.label)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
  }
}

// MARK: - Bubble image rendering

private enum BubbleImage {
  static let size = CGSize(width: 320, height: 200)

  static func ping(name: String, day: String, slot: String, message: String) -> UIImage {
    render { ctx, rect in
      drawHeader(rect, title: "VIBE CHECK")
      let bodyTop = rect.minY + 64
      draw("\(name) wants to hang", at: CGPoint(x: 20, y: bodyTop), size: 19, weight: .bold,
           color: Brand.uiInk)
      draw("\(DateFmt.friendly(day)) · \(slotLabel(slot))", at: CGPoint(x: 20, y: bodyTop + 30),
           size: 15, weight: .semibold, color: Brand.uiGreen)
      draw(slotRange(slot), at: CGPoint(x: 20, y: bodyTop + 52), size: 13, weight: .regular,
           color: Brand.uiInk.withAlphaComponent(0.6))
      if !message.isEmpty {
        draw("“\(message)”", at: CGPoint(x: 20, y: bodyTop + 80), size: 14, weight: .regular,
             color: Brand.uiInk.withAlphaComponent(0.8), maxWidth: rect.width - 40)
      }
      drawTapHint(rect, "Tap to accept")
    }
  }

  static func availability(name: String, days: [AvailabilityDay]) -> UIImage {
    render { ctx, rect in
      drawHeader(rect, title: "FREE TIME")
      let bodyTop = rect.minY + 64
      draw("\(name) is free at", at: CGPoint(x: 20, y: bodyTop), size: 19, weight: .bold,
           color: Brand.uiInk)
      var y = bodyTop + 32
      for day in days.prefix(3) {
        let slots = day.slots.map { slotLabel($0) }.joined(separator: ", ")
        draw(DateFmt.friendly(day.date), at: CGPoint(x: 20, y: y), size: 13, weight: .semibold,
             color: Brand.uiGreen)
        draw(slots, at: CGPoint(x: 120, y: y), size: 13, weight: .regular,
             color: Brand.uiInk.withAlphaComponent(0.8), maxWidth: rect.width - 140)
        y += 24
      }
      drawTapHint(rect, "Tap to pick a time")
    }
  }

  static func response(title: String, detail: String) -> UIImage {
    render { ctx, rect in
      drawHeader(rect, title: "PARADE")
      let bodyTop = rect.minY + 70
      draw(title, at: CGPoint(x: 20, y: bodyTop), size: 19, weight: .bold, color: Brand.uiInk)
      draw(detail, at: CGPoint(x: 20, y: bodyTop + 30), size: 15, weight: .semibold,
           color: Brand.uiGreen)
    }
  }

  // MARK: drawing primitives

  private static func render(_ body: (CGContext, CGRect) -> Void) -> UIImage {
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { c in
      let rect = CGRect(origin: .zero, size: size)
      Brand.uiCustard.setFill()
      c.cgContext.fill(rect)
      body(c.cgContext, rect)
    }
  }

  private static func drawHeader(_ rect: CGRect, title: String) {
    let headerRect = CGRect(x: 0, y: 0, width: rect.width, height: 44)
    Brand.uiGreen.setFill()
    UIRectFill(headerRect)
    draw("Parade", at: CGPoint(x: 20, y: 12), size: 18, weight: .bold, color: Brand.uiWhite,
         serif: true)
    draw(title, at: CGPoint(x: rect.width - 120, y: 16), size: 11, weight: .semibold,
         color: Brand.uiMarigold, align: .right, boxWidth: 100)
  }

  private static func drawTapHint(_ rect: CGRect, _ text: String) {
    draw(text, at: CGPoint(x: 20, y: rect.height - 28), size: 12, weight: .semibold,
         color: Brand.uiGreen)
  }

  private static func draw(_ text: String, at point: CGPoint, size: CGFloat,
                           weight: UIFont.Weight, color: UIColor, serif: Bool = false,
                           maxWidth: CGFloat? = nil, align: NSTextAlignment = .left,
                           boxWidth: CGFloat? = nil) {
    var font = UIFont.systemFont(ofSize: size, weight: weight)
    if serif, let d = UIFont.systemFont(ofSize: size, weight: weight).fontDescriptor
      .withDesign(.serif) {
      font = UIFont(descriptor: d, size: size)
    }
    let para = NSMutableParagraphStyle()
    para.alignment = align
    para.lineBreakMode = .byTruncatingTail
    let attrs: [NSAttributedString.Key: Any] = [
      .font: font, .foregroundColor: color, .paragraphStyle: para,
    ]
    let w = boxWidth ?? maxWidth ?? (BubbleImage.size.width - point.x - 16)
    (text as NSString).draw(with: CGRect(x: point.x, y: point.y, width: w, height: 60),
                            options: [.usesLineFragmentOrigin], attributes: attrs, context: nil)
  }
}
