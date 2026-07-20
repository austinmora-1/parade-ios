/**
 * Share availability — send friends a view of when you're free.
 *
 * Two paths:
 *   1. Share a link — a Preview button (opens the exact public page the
 *      recipient sees) plus an omni-channel grid matching the PWA
 *      UnifiedShareSheet (Messages, WhatsApp, Telegram, Email, Copy, More).
 *      Links point at helloparade.app/share/{code}?view=…&src=ios.
 *   2. Send directly to friends on Parade — invokes send-push-notification
 *      (same fn as the other flows), which writes the in-app notification
 *      row per friend and delivers the push, deep-linking them to your
 *      profile.
 *
 * Range options mirror the PWA ShareDialog: 1 week / 4 weeks / 3 months
 * (view params 1w / 1m / 3m so the existing share page understands them).
 * Reached from the FAB sheet and the Plans tab header.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { addDays, format, isSaturday, isSunday, differenceInCalendarDays, startOfDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Send,
  Check,
  CalendarRange,
  Calendar,
  Users,
  Eye,
  Globe,
} from 'lucide-react-native';
import { ShareChannelGrid } from '@/components/share/ShareChannelGrid';
import {
  AvailabilityPreview,
  grainForSpan,
  GRAIN_HINT,
} from '@/components/share/AvailabilityPreview';
import { DatePickerModal } from '@/components/primitives/DatePickerModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';
import { PARADE_GREEN, ELEPHANT } from '@/lib/colors';

const SHARE_DOMAIN = 'https://helloparade.app';

/** Preset ranges — view keys match the PWA share page's ?view= param. Their
 *  share granularity is derived from the span, same as a custom range. */
const RANGES = [
  { view: '1w', label: '1 week', days: 7 },
  { view: '1m', label: '4 weeks', days: 28 },
  { view: '3m', label: '3 months', days: 91 },
] as const;
type RangeView = (typeof RANGES)[number]['view'];

export default function ShareAvailabilityScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans = usePlannerStore((s) => s.plans);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);
  const defaultSettings = useAvailabilityStore((s) => s.defaultSettings);
  const loadAvailabilityForRange = useAvailabilityStore((s) => s.loadAvailabilityForRange);

  const today = useMemo(() => startOfDay(new Date()), []);
  // Default to the 1-week range — the most common share and the least
  // overwhelming to scan; longer spans are a tap away.
  const [view, setView] = useState<RangeView | 'custom'>('1w');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date>(today);
  const [customEnd, setCustomEnd] = useState<Date>(() => addDays(today, 13));
  const [pickerOpen, setPickerOpen] = useState(false);

  // Resolve the selection (preset or custom) into a concrete range + share
  // granularity. Granularity auto-derives from the span (XPE-312): a week →
  // time slots, up to a month → open days, longer → open weekends.
  const resolved = useMemo(() => {
    if (view === 'custom') {
      const start = customStart;
      const end = customEnd >= customStart ? customEnd : customStart;
      const span = differenceInCalendarDays(end, start) + 1;
      return {
        custom: true as const,
        grain: grainForSpan(span),
        start,
        end,
        label: `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
      };
    }
    const preset = RANGES.find((r) => r.view === view)!;
    return {
      custom: false as const,
      grain: grainForSpan(preset.days),
      start: today,
      end: addDays(today, preset.days - 1),
      label: preset.label,
    };
  }, [view, customStart, customEnd, today]);

  /** Human phrase for messages: "over the next 4 weeks" / "for Jul 21 – Aug 3". */
  const rangePhrase = resolved.custom ? `for ${resolved.label}` : `over the next ${resolved.label}`;

  // Load real availability rows across the visible horizon so preview wheels
  // aren't all schedule-derived defaults — covers custom ranges that reach
  // past the default 3-month window too.
  useEffect(() => {
    if (!user?.id) return;
    const horizon = addDays(today, 92);
    const end = resolved.end > horizon ? resolved.end : horizon;
    loadAvailabilityForRange(today, end, user.id).catch(() => {});
  }, [user?.id, resolved.end, today, loadAvailabilityForRange]);

  // share_code + display name for the link and the notification copy
  const { data: me } = useQuery({
    enabled: !!user?.id,
    queryKey: ['share-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('share_code, display_name, first_name')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data as { share_code: string; display_name: string | null; first_name: string | null };
    },
  });
  const myName = me?.first_name || me?.display_name || 'Your friend';
  // Preset ranges pass ?view=1w|1m|3m; a custom range passes explicit dates so
  // the web page can render the exact same window.
  const viewParam = resolved.custom
    ? `custom&start=${format(resolved.start, 'yyyy-MM-dd')}&end=${format(resolved.end, 'yyyy-MM-dd')}`
    : view;
  const shareUrl = me?.share_code
    ? `${SHARE_DOMAIN}/share/${me.share_code}?view=${viewParam}&src=ios`
    : null;

  // One-line availability summary matched to the range's granularity (XPE-312):
  // weekend days when sharing weekends, all days otherwise. A day counts as
  // free when any slot is open; days without a row use the schedule default.
  const summary = useMemo(() => {
    const weekendsOnly = resolved.grain === 'weekends';
    let free = 0;
    let total = 0;
    const n = differenceInCalendarDays(resolved.end, resolved.start) + 1;
    for (let i = 0; i < n && i < 400; i++) {
      const d = addDays(resolved.start, i);
      if (weekendsOnly && !isSaturday(d) && !isSunday(d)) continue;
      const dateStr = format(d, 'yyyy-MM-dd');
      const day = availabilityMap[dateStr] ?? createDefaultAvailability(d, defaultSettings);
      total += 1;
      if (Object.values(day.slots).some(Boolean)) free += 1;
    }
    const noun = weekendsOnly ? 'weekend days' : 'days';
    return `${free} of ${total} ${noun} free ${rangePhrase}`;
  }, [resolved, rangePhrase, availabilityMap, defaultSettings]);

  // ── Path 1: omni-channel link sharing (channel grid below) ────────────────
  const shareMessage = `Here's when I'm free ${rangePhrase} — let's make a plan!`;
  const emailSubject = `${myName} shared their Parade availability`;

  // In-app preview — the granularity-adaptive view of my availability (XPE-312).
  const openPreview = useCallback(() => {
    Haptics.selectionAsync();
    setPreviewOpen(true);
  }, []);

  // Secondary: open the exact public web page the recipient will see.
  const openWebPreview = useCallback(async () => {
    if (!shareUrl) return;
    Haptics.selectionAsync();
    try {
      await WebBrowser.openBrowserAsync(shareUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    } catch {
      /* ignore */
    }
  }, [shareUrl]);

  // ── Path 2: direct in-app share to connected friends ──────────────────────
  const connectedFriends = useMemo(
    () =>
      friends
        .filter((f) => f.status === 'connected' && f.friendUserId)
        .map((f) => ({ userId: f.friendUserId!, name: f.name, avatar: f.avatar ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [friends],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const toggleFriend = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSendDirect = useCallback(async () => {
    if (!user?.id || selectedIds.size === 0 || sending) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const targets = [...selectedIds];
      const title = `📅 ${myName} shared their availability`;
      const body = `See when ${myName} is free ${rangePhrase} and make a plan.`;
      // The edge function writes the in-app notifications row per recipient
      // (recipient's notifications screen routes /friends/<id> urls to the
      // friend profile = my availability) AND delivers the device push —
      // don't also insert client-side or recipients see it twice.
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: targets,
          title,
          body,
          url: `/friends/${user.id}`,
          type: 'availability-share',
          data: {
            share_code: me?.share_code ?? null,
            view: resolved.custom ? 'custom' : view,
            start: format(resolved.start, 'yyyy-MM-dd'),
            end: format(resolved.end, 'yyyy-MM-dd'),
          },
        },
      });
      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Availability shared',
        `Sent to ${targets.length} ${targets.length === 1 ? 'friend' : 'friends'}.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (err: any) {
      console.error('share-availability direct send failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not share', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [user?.id, selectedIds, sending, myName, rangePhrase, me?.share_code, view, resolved]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-lg text-foreground">Share availability</Text>
        <View className="w-9 h-9" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 gap-5 pb-10">
        {/* Range picker */}
        <View>
          <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
            Time range
          </Text>
          <View className="flex-row gap-2">
            {RANGES.map((r) => {
              const selected = view === r.view;
              return (
                <Pressable
                  key={r.view}
                  onPress={() => { Haptics.selectionAsync(); setView(r.view); }}
                  className={`flex-1 rounded-xl border px-2 py-2.5 items-center gap-0.5 active:opacity-70 ${
                    selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                  }`}
                >
                  <Text
                    className={`font-sans text-[15px] font-semibold ${
                      selected ? 'text-white' : 'text-foreground'
                    }`}
                  >
                    {r.label}
                  </Text>
                  {/* Granularity hint — what recipients see at this range */}
                  <Text
                    className={`font-sans text-[10px] text-center ${
                      selected ? 'text-white/80' : 'text-muted-foreground'
                    }`}
                  >
                    {GRAIN_HINT[grainForSpan(r.days)]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom range — granularity still auto-adapts to the span (XPE-312) */}
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setView('custom'); }}
            className={`mt-2 flex-row items-center justify-center gap-2 rounded-xl border px-3 py-2.5 active:opacity-70 ${
              view === 'custom' ? 'bg-primary border-primary' : 'bg-card border-border/40'
            }`}
          >
            <Calendar size={14} color={view === 'custom' ? '#FFFFFF' : PARADE_GREEN} strokeWidth={2} />
            <Text
              className={`font-sans text-[14px] font-semibold ${
                view === 'custom' ? 'text-white' : 'text-foreground'
              }`}
            >
              Custom dates
            </Text>
            {view === 'custom' && (
              <Text className="font-sans text-[11px] text-white/80">· {GRAIN_HINT[resolved.grain]}</Text>
            )}
          </Pressable>

          {/* Custom start / end pickers */}
          {view === 'custom' && (
            <View className="flex-row gap-2 mt-2">
              {([
                { key: 'start' as const, label: 'Start', date: resolved.start },
                { key: 'end' as const, label: 'End', date: resolved.end },
              ]).map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => { Haptics.selectionAsync(); setPickerOpen(true); }}
                  className="flex-1 rounded-xl border border-border/40 bg-card px-3 py-2.5 active:opacity-70"
                >
                  <Text className="font-sans text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {f.label}
                  </Text>
                  <Text className="font-sans text-[15px] font-semibold text-foreground mt-0.5">
                    {format(f.date, 'EEE, MMM d')}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* One-line availability summary (no per-day list) */}
        <View className="flex-row items-center gap-2 px-0.5">
          <CalendarRange size={14} color={PARADE_GREEN} strokeWidth={2} />
          <Text className="font-sans text-[13px] text-muted-foreground">{summary}</Text>
        </View>

        {/* Prominent share card — the link + channels are the focus */}
        <View className="bg-card rounded-2xl border border-border/30 p-4 gap-4 shadow-sm">
          <View className="gap-0.5">
            <Text className="font-display text-lg text-foreground">Send your link</Text>
            <Text className="font-sans text-[13px] text-muted-foreground leading-relaxed">
              Anyone with the link sees when you're free — busy slots stay private.
            </Text>
          </View>

          {/* Channel grid (matches PWA UnifiedShareSheet) */}
          <ShareChannelGrid
            link={shareUrl}
            message={shareMessage}
            emailSubject={emailSubject}
            title="My availability"
          />

          {/* Preview: in-app, adapts to the selected range (XPE-312) */}
          <Pressable
            onPress={openPreview}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 active:opacity-70"
          >
            <Eye size={15} color={PARADE_GREEN} strokeWidth={2} />
            <Text className="font-sans text-sm font-semibold text-primary">
              Preview what friends see
            </Text>
          </Pressable>
        </View>

        {/* Path 2 — direct to friends on Parade */}
        <View>
          <View className="flex-row items-center justify-between px-0.5 mb-2">
            <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
              Or send directly on Parade
            </Text>
            {selectedIds.size > 0 && (
              <Text className="font-sans text-[13px] text-muted-foreground">
                {selectedIds.size} selected
              </Text>
            )}
          </View>
          {connectedFriends.length === 0 ? (
            <View className="bg-card rounded-2xl border border-border/30 p-4 flex-row items-center gap-3">
              <Users size={16} color={ELEPHANT} strokeWidth={2} />
              <Text className="font-sans text-[13px] text-muted-foreground flex-1">
                No connected friends yet — share the link instead, or invite friends to Parade.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingHorizontal: 2, paddingVertical: 4 }}
            >
              {connectedFriends.map((f) => {
                const isSel = selectedIds.has(f.userId);
                return (
                  <Pressable
                    key={f.userId}
                    onPress={() => toggleFriend(f.userId)}
                    className="items-center active:opacity-70"
                    style={{ width: 68 }}
                  >
                    <View
                      className="rounded-full"
                      style={{
                        padding: 2,
                        borderWidth: 2,
                        borderColor: isSel ? PARADE_GREEN : 'transparent',
                      }}
                    >
                      <Avatar url={f.avatar} displayName={f.name} size="lg" />
                      {isSel && (
                        <View className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary items-center justify-center border-2 border-card">
                          <Check size={11} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      className={`font-sans text-[13px] mt-1.5 ${
                        isSel ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {f.name.split(' ')[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Send bar — direct share */}
      {connectedFriends.length > 0 && (
        <View className="px-5 pb-4 pt-2 border-t border-border/20 bg-chalk">
          <Pressable
            onPress={handleSendDirect}
            disabled={selectedIds.size === 0 || sending}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${
              selectedIds.size === 0 || sending ? 'bg-muted' : 'bg-primary active:opacity-90'
            }`}
          >
            {sending ? (
              <ActivityIndicator size="small" color={ELEPHANT} />
            ) : (
              <Send size={15} color={selectedIds.size === 0 ? ELEPHANT : '#FFFFFF'} strokeWidth={2} />
            )}
            <Text
              className={`font-sans text-base font-semibold ${
                selectedIds.size === 0 || sending ? 'text-muted-foreground' : 'text-white'
              }`}
            >
              {sending
                ? 'Sending…'
                : selectedIds.size === 0
                  ? 'Select friends to notify'
                  : `Send to ${selectedIds.size} ${selectedIds.size === 1 ? 'friend' : 'friends'}`}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Full-screen in-app preview — "what friends will see" at the range's
          granularity. An absolute overlay (not RN <Modal>) to stay inside the
          nav tree, matching BugReportButton (XPE-312). */}
      {previewOpen && (
        <View className="absolute inset-0 bg-chalk" style={{ zIndex: 50 }}>
          <SafeAreaView className="flex-1" edges={['top']}>
            <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
              <Pressable
                onPress={() => setPreviewOpen(false)}
                hitSlop={8}
                accessibilityLabel="Close preview"
                className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
              >
                <X size={20} color={TC.icon} strokeWidth={2} />
              </Pressable>
              <View className="items-center">
                <Text className="font-display text-lg text-foreground">What friends will see</Text>
                <Text className="font-sans text-[11px] text-muted-foreground">
                  {resolved.label} · {GRAIN_HINT[resolved.grain]}
                </Text>
              </View>
              <View className="w-9 h-9" />
            </View>

            <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 gap-3 pb-10">
              <AvailabilityPreview
                grain={resolved.grain}
                start={resolved.start}
                end={resolved.end}
                availabilityMap={availabilityMap}
                defaultSettings={defaultSettings}
                plans={plans}
              />

              {/* Secondary: the exact public web page recipients open */}
              {shareUrl && (
                <Pressable
                  onPress={openWebPreview}
                  className="flex-row items-center justify-center gap-2 rounded-xl border border-border/40 bg-card py-2.5 mt-2 active:opacity-70"
                >
                  <Globe size={15} color={ELEPHANT} strokeWidth={2} />
                  <Text className="font-sans text-sm font-semibold text-muted-foreground">
                    Open web version
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Custom-range date picker (start / end), clamped so end ≥ start */}
      <DatePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="range"
        rangeStart={customStart}
        rangeEnd={customEnd}
        onRangeChange={(start, end) => {
          setCustomStart(startOfDay(start));
          setCustomEnd(startOfDay(end));
          setPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
