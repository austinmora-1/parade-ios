// MessagesViewController.swift
//
// Parade iMessage extension.
//
// Drawer (compose) mirrors the in-app FAB "What are you planning?" panel, but
// limited to the two "Reach out" actions — Quick ping and Share availability —
// and instead of opening a deep link, each composes an INTERACTIVE message
// bubble the friend can act on inside Messages:
//
//   • Quick ping       → sender proposes a day + slot (+ optional note); the
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
  static let panel = Color(red: 28 / 255, green: 26 / 255, blue: 22 / 255).opacity(0.94)
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

  var senderName: String?
  var availability: [AvailabilityDay] = []

  // Wired by the controller.
  var onSendPing: ((PingDraft) -> Void)?
  var onShareAvail: (([AvailabilityDay]) -> Void)?
  var onAcceptPing: ((Payload) -> Void)?
  var onPickSlot: ((Payload, String, String) -> Void)? // payload, day, slot
  var onPass: ((Payload) -> Void)?
  var requestExpand: (() -> Void)?
}

// MARK: - Principal class (referenced by Info.plist NSExtensionPrincipalClass)

class MessagesViewController: MSMessagesAppViewController {

  private let model = DrawerModel()
  private var host: UIHostingController<RootView>?

  override func viewDidLoad() {
    super.viewDidLoad()
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
  }

  private func embedHost() {
    let h = UIHostingController(rootView: RootView(model: model))
    h.view.backgroundColor = .clear
    addChild(h)
    h.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(h.view)
    NSLayoutConstraint.activate([
      h.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      h.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      h.view.topAnchor.constraint(equalTo: view.topAnchor),
      h.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    h.didMove(toParent: self)
    host = h
  }

  /// Decide compose vs. respond based on whether the user tapped one of our
  /// proposal bubbles. Refreshes the bridged availability + sender name too.
  private func refresh(for conversation: MSConversation) {
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
    .preferredColorScheme(.dark)
  }
}

// MARK: - Compose: drawer + composers

private struct ComposeRoot: View {
  @ObservedObject var model: DrawerModel

  var body: some View {
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

      DrawerRow(symbol: "hand.wave.fill", title: "Quick ping", action: onQuickPing)
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
        ComposerHeader(title: "Quick ping", subtitle: "Suggest a time to hang.", onBack: onBack)

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

private struct ShareAvailabilityComposer: View {
  let availability: [AvailabilityDay]
  let onBack: () -> Void
  let onShare: ([AvailabilityDay]) -> Void

  /// Candidate days/slots: real bridged availability if present, else the next
  /// 7 days' social slots so the composer still works before the first sync.
  private var candidates: [AvailabilityDay] {
    if !availability.isEmpty { return availability }
    return (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
      .map { AvailabilityDay(date: DateFmt.key($0), slots: socialSlotIds(for: $0)) }
  }

  // Selected slot ids keyed by date.
  @State private var selected: [String: Set<String>] = [:]
  @State private var seeded = false

  private var hasReal: Bool { !availability.isEmpty }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        ComposerHeader(
          title: "Share availability",
          subtitle: hasReal ? "Your open slots — tap to include." : "Pick the slots you want to offer.",
          onBack: onBack
        )

        ForEach(candidates, id: \.date) { day in
          VStack(alignment: .leading, spacing: 8) {
            SectionLabel(DateFmt.friendly(day.date).uppercased())
            FlowChips(items: day.slots, selected: selected[day.date] ?? [],
                      label: { slotLabel($0) }) { slot in toggle(day.date, slot) }
          }
        }

        PrimaryButton(title: "Share \(totalSelected) slot\(totalSelected == 1 ? "" : "s")",
                      disabled: totalSelected == 0) {
          onShare(buildSelection())
        }
      }
      .padding(20)
    }
    .onAppear(perform: seedSelection)
  }

  private var totalSelected: Int { selected.values.reduce(0) { $0 + $1.count } }

  private func seedSelection() {
    guard !seeded else { return }
    seeded = true
    // Pre-select everything (the user is offering their real free time).
    var s: [String: Set<String>] = [:]
    for day in candidates { s[day.date] = Set(day.slots) }
    selected = s
  }

  private func toggle(_ date: String, _ slot: String) {
    var set = selected[date] ?? []
    if set.contains(slot) { set.remove(slot) } else { set.insert(slot) }
    selected[date] = set
  }

  private func buildSelection() -> [AvailabilityDay] {
    candidates.compactMap { day in
      let picked = (day.slots).filter { (selected[day.date] ?? []).contains($0) }
      return picked.isEmpty ? nil : AvailabilityDay(date: day.date, slots: picked)
    }
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
      drawHeader(rect, title: "QUICK PING")
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
