/**
 * Share availability — send friends a view of when you're free.
 *
 * Two paths:
 *   1. Share a link — a Preview button (opens the exact public page the
 *      recipient sees) plus an omni-channel grid matching the PWA
 *      UnifiedShareSheet (Messages, WhatsApp, Telegram, Email, Copy, More).
 *      Links point at helloparade.app/share/{code}?view=…&src=ios.
 *   2. Send directly to friends on Parade — inserts an in-app notification
 *      row per friend + fires send-push-notification (same fn as the other
 *      flows), deep-linking them to your profile.
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
import { useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react-native';
import { ShareChannelGrid } from '@/components/share/ShareChannelGrid';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';
import { TINT, PARADE_GREEN, ELEPHANT } from '@/lib/colors';

const SHARE_DOMAIN = 'https://helloparade.app';

/** Range options — view keys match the PWA share page's ?view= param. */
const RANGES = [
  { view: '1w', label: '1 week', days: 7 },
  { view: '1m', label: '4 weeks', days: 28 },
  { view: '3m', label: '3 months', days: 91 },
] as const;
type RangeView = (typeof RANGES)[number]['view'];

export default function ShareAvailabilityScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);
  const defaultSettings = useAvailabilityStore((s) => s.defaultSettings);

  const [view, setView] = useState<RangeView>('1m');
  const range = RANGES.find((r) => r.view === view)!;

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

  // Weekend availability over the selected range — a day counts as free
  // when any slot is open. Days without a row fall back to the
  // schedule-derived default, same as the rest of the app.
  const weekendDays = useMemo(() => {
    const out: { dateStr: string; label: string; free: boolean }[] = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(new Date(), i);
      if (!isSaturday(d) && !isSunday(d)) continue;
      const dateStr = format(d, 'yyyy-MM-dd');
      const day = availabilityMap[dateStr] ?? createDefaultAvailability(d, defaultSettings);
      const free = Object.values(day.slots).some(Boolean);
      out.push({ dateStr, label: format(d, 'EEE MMM d'), free });
    }
    return out;
  }, [range.days, availabilityMap, defaultSettings]);
  const freeWeekendCount = weekendDays.filter((d) => d.free).length;

  // ── Path 1: omni-channel link sharing (channel grid below) ────────────────
  const shareMessage = `Here's when I'm free over the next ${range.label} — let's make a plan!`;
  const emailSubject = `${myName} shared their Parade availability`;

  // Preview opens the exact public page the recipient will see.
  const handlePreview = useCallback(async () => {
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
      // In-app notification rows (recipient's notifications screen routes
      // /friends/<id> urls to the friend profile = my availability)
      const { error } = await (supabase as any).from('notifications').insert(
        targets.map((friendUserId) => ({
          user_id: friendUserId,
          actor_id: user.id,
          type: 'availability-share',
          title,
          body,
          url: `/friends/${user.id}`,
          data: { share_code: me?.share_code ?? null, view },
        })),
      );
      if (error) throw error;

      // Device push — fire-and-forget, same fn the other flows use
      supabase.functions
        .invoke('send-push-notification', {
          body: { user_ids: targets, title, body, url: `/friends/${user.id}` },
        })
        .catch(() => {});

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

  const visibleWeekends = weekendDays.slice(0, 10);
  const hiddenWeekends = weekendDays.length - visibleWeekends.length;

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
                  className={`flex-1 rounded-xl border px-3 py-2.5 items-center active:opacity-70 ${
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
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Weekend preview */}
        <View className="bg-card rounded-2xl border border-border/30 p-4 gap-3 shadow-sm">
          <View className="flex-row items-center gap-2">
            <CalendarRange size={15} color={PARADE_GREEN} strokeWidth={2} />
            <Text className="font-sans text-[15px] font-semibold text-foreground">
              {freeWeekendCount} of {weekendDays.length} weekend days free
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {visibleWeekends.map((d) => (
              <View
                key={d.dateStr}
                className="flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
                style={{
                  backgroundColor: d.free ? TINT.primarySubtle : TINT.grayFaint,
                  borderColor: d.free ? 'rgba(35,116,77,0.35)' : 'rgba(146,146,152,0.25)',
                }}
              >
                <View
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: d.free ? PARADE_GREEN : ELEPHANT }}
                />
                <Text className="font-sans text-[13px] font-medium text-foreground">
                  {d.label}
                </Text>
              </View>
            ))}
            {hiddenWeekends > 0 && (
              <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: TINT.grayFaint }}>
                <Text className="font-sans text-[13px] text-muted-foreground">
                  +{hiddenWeekends} more
                </Text>
              </View>
            )}
          </View>
          <Text className="font-sans text-[13px] text-muted-foreground leading-relaxed">
            Friends see your free time slots for the next {range.label} — busy slots stay
            private, just marked unavailable.
          </Text>
        </View>

        {/* Path 1 — preview + omni-channel link share */}
        <View className="gap-3">
          {/* Preview: opens the exact page the recipient sees */}
          <Pressable
            onPress={handlePreview}
            disabled={!shareUrl}
            className={`flex-row items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 active:opacity-70 ${
              shareUrl ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-muted/40'
            }`}
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: TINT.primarySubtle }}
            >
              <Eye size={16} color={PARADE_GREEN} strokeWidth={2} />
            </View>
            <View className="flex-1">
              <Text className="font-sans text-sm font-semibold text-foreground">Preview</Text>
              <Text className="font-sans text-xs text-muted-foreground">
                See exactly what friends will see
              </Text>
            </View>
          </Pressable>

          {/* Channel grid (matches PWA UnifiedShareSheet) */}
          <ShareChannelGrid
            link={shareUrl}
            message={shareMessage}
            emailSubject={emailSubject}
            title="My availability"
          />
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
    </SafeAreaView>
  );
}
