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
import { addDays, format, isSaturday, isSunday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Send,
  Check,
  CalendarRange,
  Users,
  Eye,
  Globe,
} from 'lucide-react-native';
import { ShareChannelGrid } from '@/components/share/ShareChannelGrid';
import { AvailabilityPreview } from '@/components/share/AvailabilityPreview';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';
import { PARADE_GREEN, ELEPHANT } from '@/lib/colors';

const SHARE_DOMAIN = 'https://helloparade.app';

/** Range options — view keys match the PWA share page's ?view= param. Each
 *  range shares availability at a different granularity (XPE-312). */
const RANGES = [
  { view: '1w', label: '1 week', days: 7, grain: 'time slots' },
  { view: '1m', label: '4 weeks', days: 28, grain: 'open days' },
  { view: '3m', label: '3 months', days: 91, grain: 'open weekends' },
] as const;
type RangeView = (typeof RANGES)[number]['view'];

export default function ShareAvailabilityScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans = usePlannerStore((s) => s.plans);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);
  const defaultSettings = useAvailabilityStore((s) => s.defaultSettings);
  const loadAvailabilityForRange = useAvailabilityStore((s) => s.loadAvailabilityForRange);

  const [view, setView] = useState<RangeView>('3m');
  const [previewOpen, setPreviewOpen] = useState(false);
  const range = RANGES.find((r) => r.view === view)!;

  // Make sure real availability rows for the full 3-month horizon are loaded so
  // the in-app preview wheels aren't all schedule-derived defaults (XPE-312).
  useEffect(() => {
    if (!user?.id) return;
    loadAvailabilityForRange(new Date(), addDays(new Date(), 92), user.id).catch(() => {});
  }, [user?.id, loadAvailabilityForRange]);

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
  const shareUrl = me?.share_code
    ? `${SHARE_DOMAIN}/share/${me.share_code}?view=${view}&src=ios`
    : null;

  // One-line availability summary matched to the range's granularity (XPE-312):
  // weekends for 3 months, all days otherwise. A day counts as free when any
  // slot is open; days without a row fall back to the schedule-derived default.
  const summary = useMemo(() => {
    const weekendsOnly = view === '3m';
    let free = 0;
    let total = 0;
    for (let i = 0; i < range.days; i++) {
      const d = addDays(new Date(), i);
      if (weekendsOnly && !isSaturday(d) && !isSunday(d)) continue;
      const dateStr = format(d, 'yyyy-MM-dd');
      const day = availabilityMap[dateStr] ?? createDefaultAvailability(d, defaultSettings);
      total += 1;
      if (Object.values(day.slots).some(Boolean)) free += 1;
    }
    const noun = weekendsOnly ? 'weekend days' : 'days';
    return `${free} of ${total} ${noun} free over the next ${range.label}`;
  }, [view, range.days, range.label, availabilityMap, defaultSettings]);

  // ── Path 1: omni-channel link sharing (channel grid below) ────────────────
  const shareMessage = `Here's when I'm free over the next ${range.label} — let's make a plan!`;
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
      const body = `See when ${myName} is free over the next ${range.label} and make a plan.`;
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
          data: { share_code: me?.share_code ?? null, view },
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
  }, [user?.id, selectedIds, sending, myName, range.label, me?.share_code, view]);

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
                    {r.grain}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
                  {range.label} · {range.grain}
                </Text>
              </View>
              <View className="w-9 h-9" />
            </View>

            <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 gap-3 pb-10">
              <AvailabilityPreview
                view={view}
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
    </SafeAreaView>
  );
}
