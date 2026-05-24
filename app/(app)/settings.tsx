/**
 * Settings page — Phase 2 Block 7 wired toggles.
 *
 * Sections:
 *   - Notifications: Plan Reminders / Friend Requests / Plan Invitations
 *     → live-binds to profiles.{plan_reminders, friend_requests_notifications,
 *       plan_invitations_notifications}
 *   - Sharing & Privacy: Show Availability → profiles.show_availability
 *   - Calendar: connects iPhone Calendar via expo-calendar (EventKit) permission
 *   - Account: destructive Sign Out button
 *   - Footer: Privacy Policy / Terms of Service / signed-in email
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  LogOut,
  Bell,
  Sparkles,
  Calendar as CalendarIcon,
  Check,
  RefreshCw,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncCalendarBusyTimes, getLastSyncTime } from '@/lib/calendarSync';
import { formatDistanceToNow } from 'date-fns';

// ─── Profile settings query ──────────────────────────────────────────────────

function useProfileSettings(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile-settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'plan_reminders, friend_requests_notifications, plan_invitations_notifications, ' +
          'show_availability, show_location, show_vibe_status, allow_all_hang_requests, ' +
          'interests, social_goals, social_cap, preferred_social_days, preferred_social_times',
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

// ─── Social preferences constants ────────────────────────────────────────────

const INTEREST_OPTIONS = [
  'Foodie', 'Outdoors', 'Movies', 'Concerts', 'Sports', 'Reading',
  'Travel', 'Art', 'Gaming', 'Music', 'Cooking', 'Yoga', 'Coffee',
  'Cocktails', 'Nightlife', 'Photography', 'Hiking', 'Fitness',
];

const GOAL_OPTIONS = [
  'Meet new people',
  'Stay close with friends',
  'Try new activities',
  'Have a regular routine',
  'Spontaneous fun',
  'Quality time',
  'Be more active',
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const TIME_SLOT_OPTIONS = [
  { id: 'early-morning',   label: 'Early AM' },
  { id: 'late-morning',    label: 'Morning' },
  { id: 'early-afternoon', label: 'Afternoon' },
  { id: 'late-afternoon',  label: 'Late PM' },
  { id: 'evening',         label: 'Evening' },
  { id: 'late-night',      label: 'Late night' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  children,
  destructive = false,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <View
      className={`mx-5 bg-white rounded-xl overflow-hidden shadow-sm ${
        destructive ? 'border border-destructive/20' : 'border border-border/30'
      }`}
    >
      {children}
    </View>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border/30">
      {icon}
      <Text className="font-display text-sm text-foreground">{label}</Text>
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  isLast,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      className={`px-4 py-3 flex-row items-center justify-between gap-3 ${
        isLast ? '' : 'border-b border-border/20'
      }`}
    >
      <View className="flex-1">
        <Text className="font-sans text-sm font-medium text-foreground">{title}</Text>
        {subtitle && (
          <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
            {subtitle}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#DED4C3', true: '#23744D' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#DED4C3"
      />
    </View>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { signOut, user } = useAuth();
  const { data: settings, isLoading, refetch } = useProfileSettings(user?.id);
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const setUserId       = usePlannerStore((s) => s.setUserId);

  // Local optimistic state (server-backed)
  const [reminders,     setReminders]     = useState(true);
  const [friendReq,     setFriendReq]     = useState(true);
  const [planInvites,   setPlanInvites]   = useState(true);
  const [showAvail,     setShowAvail]     = useState(true);
  const [showLocation,  setShowLocation]  = useState(true);
  const [showVibe,      setShowVibe]      = useState(true);
  const [allowHang,     setAllowHang]     = useState(true);
  const [interests,     setInterests]     = useState<string[]>([]);
  const [socialGoals,   setSocialGoals]   = useState<string[]>([]);
  const [socialCap,     setSocialCap]     = useState<number | null>(null);
  const [prefDays,      setPrefDays]      = useState<string[]>([]);
  const [prefTimes,     setPrefTimes]     = useState<string[]>([]);
  const [savingKey,     setSavingKey]     = useState<string | null>(null);
  const [calendarState, setCalendarState] = useState<
    'unknown' | 'granted' | 'denied'
  >('unknown');
  const [syncing,     setSyncing]     = useState(false);
  const [lastSyncAt,  setLastSyncAt]  = useState<Date | null>(getLastSyncTime());

  // Ensure planner store has userId for setAvailability calls
  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  // Hydrate from server (default true if column is null)
  useEffect(() => {
    if (!settings) return;
    setReminders(settings.plan_reminders ?? true);
    setFriendReq(settings.friend_requests_notifications ?? true);
    setPlanInvites(settings.plan_invitations_notifications ?? true);
    setShowAvail(settings.show_availability ?? true);
    setShowLocation(settings.show_location ?? true);
    setShowVibe(settings.show_vibe_status ?? true);
    setAllowHang(settings.allow_all_hang_requests ?? true);
    setInterests(settings.interests ?? []);
    setSocialGoals(settings.social_goals ?? []);
    setSocialCap(settings.social_cap ?? null);
    setPrefDays(settings.preferred_social_days ?? []);
    setPrefTimes(settings.preferred_social_times ?? []);
  }, [settings]);

  // Check calendar permission status on mount
  useEffect(() => {
    Calendar.getCalendarPermissionsAsync().then(({ status }) => {
      setCalendarState(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'unknown');
    }).catch(() => {});
  }, []);

  // ── Save a single setting ─────────────────────────────────────────────────
  const persist = useCallback(
    async (
      column: string,
      value: any,
      onRollback?: () => void,
    ) => {
      if (!user?.id) return;
      setSavingKey(column);
      Haptics.selectionAsync();
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ [column]: value } as any)
          .eq('user_id', user.id);
        if (error) throw error;
      } catch (err) {
        console.error(`Save ${column} failed`, err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        onRollback?.();
        Alert.alert('Could not save', 'Please try again.');
      } finally {
        setSavingKey(null);
      }
    },
    [user?.id],
  );

  // ── Array-toggle helpers for chip-style fields ──────────────────────────
  const toggleArrayValue = useCallback(
    (
      column: 'interests' | 'social_goals' | 'preferred_social_days' | 'preferred_social_times',
      arr: string[],
      setLocal: (next: string[]) => void,
      value: string,
    ) => {
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      setLocal(next);
      persist(column, next, () => setLocal(arr));
    },
    [persist],
  );

  // ── Calendar permission flow ───────────────────────────────────────────────
  const handleConnectCalendar = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (calendarState === 'denied') {
      Alert.alert(
        'Calendar access denied',
        'To enable, open Settings → Parade and allow Calendar access.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    setCalendarState(status === 'granted' ? 'granted' : 'denied');
    if (status === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [calendarState]);

  // ── Sync calendar busy times ──────────────────────────────────────────────
  const handleSyncCalendar = useCallback(async () => {
    if (calendarState !== 'granted') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    try {
      const result = await syncCalendarBusyTimes(setAvailability, 14);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastSyncAt(getLastSyncTime());

      const noChange = result.slotsAdded === 0 && result.slotsRemoved === 0;
      const parts: string[] = [];
      if (result.slotsAdded > 0) {
        parts.push(`${result.slotsAdded} new busy slot${result.slotsAdded === 1 ? '' : 's'}`);
      }
      if (result.slotsRemoved > 0) {
        parts.push(`${result.slotsRemoved} slot${result.slotsRemoved === 1 ? '' : 's'} freed up`);
      }

      Alert.alert(
        'Calendar synced',
        noChange
          ? `No changes — you have ${result.eventsCount} event${result.eventsCount === 1 ? '' : 's'} in the next 14 days.`
          : `${parts.join(' · ')} across ${result.daysAffected} day${result.daysAffected === 1 ? '' : 's'}.`,
      );
    } catch (err: any) {
      console.error('Calendar sync failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sync failed', err?.message ?? 'Please try again.');
    } finally {
      setSyncing(false);
    }
  }, [calendarState, setAvailability]);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  // ── Toggle handlers (optimistic) ──────────────────────────────────────────
  const onTogglePlanReminders = (v: boolean) => {
    setReminders(v);
    persist('plan_reminders', v, () => setReminders(!v));
  };
  const onToggleFriendReq = (v: boolean) => {
    setFriendReq(v);
    persist('friend_requests_notifications', v, () => setFriendReq(!v));
  };
  const onTogglePlanInvites = (v: boolean) => {
    setPlanInvites(v);
    persist('plan_invitations_notifications', v, () => setPlanInvites(!v));
  };
  const onToggleShowAvail = (v: boolean) => {
    setShowAvail(v);
    persist('show_availability', v, () => setShowAvail(!v));
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 pt-2 pb-3 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-base text-foreground">Settings</Text>
          <Text className="font-sans text-[11px] text-muted-foreground">
            Manage your account and preferences
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10 gap-3"
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator className="mt-12" color="#23744D" />
        ) : (
          <>
            {/* ── Notifications ───────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                icon={<Bell size={14} color="#23744D" strokeWidth={2} />}
                label="Notifications"
              />
              <ToggleRow
                title="Plan Reminders"
                subtitle="Get notified before your plans"
                value={reminders}
                onValueChange={onTogglePlanReminders}
                disabled={savingKey === 'plan_reminders'}
              />
              <ToggleRow
                title="Friend Requests"
                subtitle="When someone connects with you"
                value={friendReq}
                onValueChange={onToggleFriendReq}
                disabled={savingKey === 'friend_requests_notifications'}
              />
              <ToggleRow
                title="Plan Invitations"
                subtitle="When you're invited to a plan"
                value={planInvites}
                onValueChange={onTogglePlanInvites}
                disabled={savingKey === 'plan_invitations_notifications'}
                isLast
              />
            </SectionCard>

            {/* ── Privacy ─────────────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                icon={<Sparkles size={14} color="#23744D" strokeWidth={2} />}
                label="Sharing & Privacy"
              />
              <ToggleRow
                title="Show Availability"
                subtitle="Friends can see your free slots"
                value={showAvail}
                onValueChange={onToggleShowAvail}
                disabled={savingKey === 'show_availability'}
                isLast
              />
            </SectionCard>

            {/* ── Social preferences ──────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                icon={<Sparkles size={14} color="#DFA53A" strokeWidth={2} />}
                label="Social Preferences"
              />

              {/* Interests */}
              <View className="px-4 py-3 border-b border-border/20">
                <Text className="font-sans text-sm font-medium text-foreground">
                  Interests
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  Used to suggest plans you'd actually enjoy.
                </Text>
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {INTEREST_OPTIONS.map((opt) => {
                    const selected = interests.includes(opt);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() =>
                          toggleArrayValue('interests', interests, setInterests, opt)
                        }
                        className={`rounded-full px-2.5 py-1 border ${
                          selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
                        } active:opacity-70`}
                      >
                        <Text
                          className={`font-sans text-xs font-medium ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Social goals */}
              <View className="px-4 py-3 border-b border-border/20">
                <Text className="font-sans text-sm font-medium text-foreground">
                  What I'm looking for
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  Helps us prioritize the right kinds of plans.
                </Text>
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {GOAL_OPTIONS.map((opt) => {
                    const selected = socialGoals.includes(opt);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() =>
                          toggleArrayValue('social_goals', socialGoals, setSocialGoals, opt)
                        }
                        className={`rounded-full px-2.5 py-1 border ${
                          selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
                        } active:opacity-70`}
                      >
                        <Text
                          className={`font-sans text-xs font-medium ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {opt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Social cap */}
              <View className="px-4 py-3 border-b border-border/20">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-sans text-sm font-medium text-foreground">
                      Plans per week
                    </Text>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                      Your social capacity — we won't over-schedule you.
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        const next = Math.max(1, (socialCap ?? 3) - 1);
                        setSocialCap(next);
                        persist('social_cap', next, () => setSocialCap(socialCap));
                      }}
                      hitSlop={6}
                      className="w-8 h-8 rounded-full bg-muted items-center justify-center active:opacity-70"
                    >
                      <Text className="font-sans text-base font-semibold text-foreground">−</Text>
                    </Pressable>
                    <Text className="font-display text-base text-foreground w-6 text-center">
                      {socialCap ?? '—'}
                    </Text>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        const next = Math.min(14, (socialCap ?? 2) + 1);
                        setSocialCap(next);
                        persist('social_cap', next, () => setSocialCap(socialCap));
                      }}
                      hitSlop={6}
                      className="w-8 h-8 rounded-full bg-primary items-center justify-center active:opacity-80"
                    >
                      <Text className="font-sans text-base font-semibold text-white">+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Preferred days */}
              <View className="px-4 py-3 border-b border-border/20">
                <Text className="font-sans text-sm font-medium text-foreground">
                  Preferred days
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  When you typically want to make plans.
                </Text>
                <View className="flex-row gap-1.5 mt-2">
                  {DAY_KEYS.map((key, i) => {
                    const selected = prefDays.includes(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() =>
                          toggleArrayValue(
                            'preferred_social_days',
                            prefDays,
                            setPrefDays,
                            key,
                          )
                        }
                        className={`flex-1 h-9 rounded-xl border items-center justify-center active:opacity-70 ${
                          selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
                        }`}
                      >
                        <Text
                          className={`font-sans text-xs font-semibold ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {DAY_LABELS[i]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Preferred times */}
              <View className="px-4 py-3">
                <Text className="font-sans text-sm font-medium text-foreground">
                  Preferred times
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  When you're typically up for hanging out.
                </Text>
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {TIME_SLOT_OPTIONS.map((opt) => {
                    const selected = prefTimes.includes(opt.id);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() =>
                          toggleArrayValue(
                            'preferred_social_times',
                            prefTimes,
                            setPrefTimes,
                            opt.id,
                          )
                        }
                        className={`rounded-full px-2.5 py-1 border ${
                          selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
                        } active:opacity-70`}
                      >
                        <Text
                          className={`font-sans text-xs font-medium ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </SectionCard>

            {/* ── Calendar ────────────────────────────────────────────── */}
            <SectionCard>
              <SectionHeader
                icon={<CalendarIcon size={14} color="#23744D" strokeWidth={2} />}
                label="Calendar"
              />
              <View className="px-4 py-3 flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-sans text-sm font-medium text-foreground">
                    Connect Calendar
                  </Text>
                  <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                    Import busy times from your iPhone calendar so friends know
                    when you're booked.
                  </Text>
                </View>
                {calendarState === 'granted' ? (
                  <View
                    className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(35,116,77,0.12)' }}
                  >
                    <Check size={12} color="#23744D" strokeWidth={2.5} />
                    <Text className="font-sans text-xs font-semibold text-primary">
                      Connected
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleConnectCalendar}
                    className="bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
                    hitSlop={4}
                  >
                    <Text className="font-sans text-xs font-semibold text-white">
                      {calendarState === 'denied' ? 'Open Settings' : 'Connect'}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Sync Now row — shown only when calendar is connected */}
              {calendarState === 'granted' && (
                <Pressable
                  onPress={handleSyncCalendar}
                  disabled={syncing}
                  className="px-4 py-3 flex-row items-center justify-between gap-3 border-t border-border/20 active:bg-muted/30"
                >
                  <View className="flex-1">
                    <Text className="font-sans text-sm font-medium text-foreground">
                      Sync now
                    </Text>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                      {lastSyncAt
                        ? `Last synced ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                        : 'Pull events from the next 14 days and mark those slots busy.'}
                    </Text>
                    <Text className="font-sans text-[10px] text-muted-foreground/60 mt-0.5">
                      Also syncs automatically when you open the app.
                    </Text>
                  </View>
                  {syncing ? (
                    <ActivityIndicator size="small" color="#23744D" />
                  ) : (
                    <View
                      className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-1.5"
                    >
                      <RefreshCw size={12} color="#23744D" strokeWidth={2.2} />
                      <Text className="font-sans text-xs font-semibold text-primary">
                        Sync
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
            </SectionCard>

            {/* ── Account ─────────────────────────────────────────────── */}
            <SectionCard destructive>
              <SectionHeader
                icon={<LogOut size={14} color="#D46549" strokeWidth={2} />}
                label="Account"
              />
              <View className="px-4 py-3 flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-sans text-sm font-medium text-foreground">
                    Sign Out
                  </Text>
                  <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                    Log out of your Parade account
                  </Text>
                </View>
                <Pressable
                  onPress={handleSignOut}
                  className="bg-destructive rounded-xl px-3 py-2 active:opacity-80"
                  hitSlop={4}
                >
                  <Text className="font-sans text-xs font-semibold text-white">
                    Sign Out
                  </Text>
                </Pressable>
              </View>
            </SectionCard>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <View className="items-center gap-2 pt-3">
              {/* Take the tour replay */}
              <Pressable
                onPress={() => router.push('/(app)/tour')}
                hitSlop={4}
                className="active:opacity-60"
              >
                <Text className="font-sans text-xs text-muted-foreground">
                  ✨ Take the tour
                </Text>
              </Pressable>

              <View className="flex-row gap-3 mt-1">
                <Pressable
                  onPress={() => Linking.openURL('https://helloparade.app/privacy')}
                >
                  <Text className="font-sans text-xs text-muted-foreground">
                    Privacy Policy
                  </Text>
                </Pressable>
                <Text className="font-sans text-xs text-muted-foreground/40">·</Text>
                <Pressable
                  onPress={() => Linking.openURL('https://helloparade.app/terms')}
                >
                  <Text className="font-sans text-xs text-muted-foreground">
                    Terms of Service
                  </Text>
                </Pressable>
              </View>
              {user?.email && (
                <Text className="font-sans text-[11px] text-muted-foreground/60 mt-1">
                  Signed in as {user.email}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
