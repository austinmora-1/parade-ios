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
  Apple,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncCalendarBusyTimes, getLastSyncTime } from '@/lib/calendarSync';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useNylasCalendar } from '@/hooks/useNylasCalendar';
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
          'interests, preferred_social_days, preferred_social_times, default_work_days, default_work_start_hour, default_work_end_hour',
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

// ─── Hour stepper (Work Schedule) ────────────────────────────────────────────

function HourStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 23.5,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min?:     number;
  max?:     number;
}) {
  const formatHour = (h: number) => {
    // Values may be fractional (8.5 = 8:30). Split into whole hour + minutes
    // and format as H:MM AM/PM regardless of step size.
    const wholeHour  = Math.floor(h);
    const minutes    = Math.round((h - wholeHour) * 60);
    const period     = wholeHour < 12 || wholeHour === 24 ? 'AM' : 'PM';
    const hour12     = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
    const mmPadded   = minutes.toString().padStart(2, '0');
    return `${hour12}:${mmPadded} ${period}`;
  };
  return (
    <View className="flex-1 flex-row items-center justify-between">
      <Text className="font-sans text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => {
            if (value <= min) return;
            Haptics.selectionAsync();
            onChange(Math.max(min, value - 0.5));
          }}
          hitSlop={6}
          className="w-7 h-7 rounded-full bg-muted items-center justify-center active:opacity-70"
        >
          <Text className="font-sans text-sm font-semibold text-foreground">−</Text>
        </Pressable>
        <Text className="font-display text-sm text-foreground w-20 text-center">
          {formatHour(value)}
        </Text>
        <Pressable
          onPress={() => {
            if (value >= max) return;
            Haptics.selectionAsync();
            onChange(Math.min(max, value + 0.5));
          }}
          hitSlop={6}
          className="w-7 h-7 rounded-full bg-primary items-center justify-center active:opacity-80"
        >
          <Text className="font-sans text-sm font-semibold text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Calendar row primitives ─────────────────────────────────────────────────

type ConnState = 'loading' | 'connected' | 'disconnected';

function CalendarProviderRow({
  providerLabel,
  providerHint,
  icon,
  state,
  isBusy,
  onConnect,
  onDisconnect,
  topBorder,
}: {
  providerLabel: string;
  providerHint:  string;
  icon:          React.ReactNode;
  state:         ConnState;
  isBusy?:       boolean;
  onConnect:     () => void | Promise<void>;
  onDisconnect:  () => void;
  topBorder?:    boolean;
}) {
  return (
    <View
      className={`px-4 py-3 flex-row items-center justify-between gap-3 ${
        topBorder ? 'border-t border-border/20' : ''
      }`}
    >
      <View className="flex-row items-center gap-2.5 flex-1">
        <View className="w-9 h-9 rounded-xl items-center justify-center bg-white border border-border/40">
          {icon}
        </View>
        <View className="flex-1">
          <Text className="font-sans text-sm font-medium text-foreground">
            {providerLabel}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
            {providerHint}
          </Text>
        </View>
      </View>

      {state === 'loading' || isBusy ? (
        <View className="px-3 py-1.5">
          <ActivityIndicator size="small" color="#23744D" />
        </View>
      ) : state === 'connected' ? (
        <View className="flex-row items-center gap-1.5">
          <View
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(35,116,77,0.12)' }}
          >
            <Check size={11} color="#23744D" strokeWidth={2.5} />
            <Text className="font-sans text-[11px] font-semibold text-primary">
              On
            </Text>
          </View>
          <Pressable
            onPress={onDisconnect}
            className="border border-border/40 rounded-xl px-2.5 py-1 active:opacity-70"
            hitSlop={4}
          >
            <Text className="font-sans text-[11px] font-semibold text-foreground/70">
              Disconnect
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onConnect}
          className="bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
          hitSlop={4}
        >
          <Text className="font-sans text-xs font-semibold text-white">
            Connect
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CalendarSyncRow({
  label,
  lastSyncedAt,
  lastResult,
  isSyncing,
  onSync,
}: {
  label:        string;
  lastSyncedAt: string | null;
  lastResult:   { eventsProcessed?: number; datesUpdated?: number } | null;
  isSyncing:    boolean;
  onSync:       () => void | Promise<void>;
}) {
  const subtitle = lastSyncedAt
    ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}` +
      (lastResult?.eventsProcessed
        ? ` · ${lastResult.eventsProcessed} events → ${lastResult.datesUpdated ?? 0} days`
        : '')
    : 'Pull busy times from the next 14 days.';
  return (
    <Pressable
      onPress={onSync}
      disabled={isSyncing}
      className="px-4 py-3 flex-row items-center justify-between gap-3 border-t border-border/20 active:bg-muted/30"
    >
      <View className="flex-1">
        <Text className="font-sans text-sm font-medium text-foreground">
          {label}
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          {subtitle}
        </Text>
      </View>
      {isSyncing ? (
        <ActivityIndicator size="small" color="#23744D" />
      ) : (
        <View className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-1.5">
          <RefreshCw size={12} color="#23744D" strokeWidth={2.2} />
          <Text className="font-sans text-xs font-semibold text-primary">
            Sync
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function GoogleGlyph() {
  // Multi-color "G" using react-native-svg paths
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function AppleGlyph() {
  return <Apple size={16} color="#0B0B0B" strokeWidth={2} />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { signOut, user } = useAuth();
  const { data: settings, isLoading, refetch } = useProfileSettings(user?.id);
  const setAvailability             = usePlannerStore((s) => s.setAvailability);
  const setUserId                   = usePlannerStore((s) => s.setUserId);
  const loadProfileAndAvailability  = usePlannerStore((s) => s.loadProfileAndAvailability);

  // Remote-calendar hooks (Google + Apple/iCloud via Nylas)
  const google = useGoogleCalendar();
  const nylas  = useNylasCalendar();

  // Local optimistic state (server-backed)
  const [reminders,     setReminders]     = useState(true);
  const [friendReq,     setFriendReq]     = useState(true);
  const [planInvites,   setPlanInvites]   = useState(true);
  const [showAvail,     setShowAvail]     = useState(true);
  const [showLocation,  setShowLocation]  = useState(true);
  const [showVibe,      setShowVibe]      = useState(true);
  const [allowHang,     setAllowHang]     = useState(true);
  const [interests,     setInterests]     = useState<string[]>([]);
  const [prefDays,      setPrefDays]      = useState<string[]>([]);
  const [prefTimes,     setPrefTimes]     = useState<string[]>([]);
  const [workDays,      setWorkDays]      = useState<string[]>([]);
  const [workStart,     setWorkStart]     = useState<number>(9);
  const [workEnd,       setWorkEnd]       = useState<number>(17);
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
    setPrefDays(settings.preferred_social_days ?? []);
    setPrefTimes(settings.preferred_social_times ?? []);
    setWorkDays(
      (settings as any).default_work_days ??
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    );
    setWorkStart((settings as any).default_work_start_hour ?? 9);
    setWorkEnd((settings as any).default_work_end_hour ?? 17);
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
      column:
        | 'interests'
        | 'social_goals'
        | 'preferred_social_days'
        | 'preferred_social_times'
        | 'default_work_days',
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
  const onToggleShowLocation = (v: boolean) => {
    setShowLocation(v);
    persist('show_location', v, () => setShowLocation(!v));
  };
  const onToggleShowVibe = (v: boolean) => {
    setShowVibe(v);
    persist('show_vibe_status', v, () => setShowVibe(!v));
  };
  const onToggleAllowHang = (v: boolean) => {
    setAllowHang(v);
    persist('allow_all_hang_requests', v, () => setAllowHang(!v));
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
              />
              <ToggleRow
                title="Show Location"
                subtitle="Friends can see your home base + current city"
                value={showLocation}
                onValueChange={onToggleShowLocation}
                disabled={savingKey === 'show_location'}
              />
              <ToggleRow
                title="Show Vibe"
                subtitle="Friends can see your current vibe + weekly intentions"
                value={showVibe}
                onValueChange={onToggleShowVibe}
                disabled={savingKey === 'show_vibe_status'}
              />
              <ToggleRow
                title="Allow Pings From All Friends"
                subtitle="Off → only your close friends can ping you for hangouts"
                value={allowHang}
                onValueChange={onToggleAllowHang}
                disabled={savingKey === 'allow_all_hang_requests'}
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

              {/* Work Schedule */}
              <View className="px-4 py-3 border-b border-border/20">
                <Text className="font-sans text-sm font-medium text-foreground">
                  Work schedule
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  We'll block these times as busy by default.
                </Text>

                {/* Work days row */}
                <View className="flex-row gap-1.5 mt-2.5">
                  {DAY_KEYS.map((key, i) => {
                    const selected = workDays.includes(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() =>
                          toggleArrayValue(
                            'default_work_days',
                            workDays,
                            setWorkDays,
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

                {/* Hours row */}
                <View className="flex-row items-center justify-between mt-3 gap-3">
                  <HourStepper
                    label="Start"
                    value={workStart}
                    onChange={(v) => {
                      setWorkStart(v);
                      persist('default_work_start_hour', v, () => setWorkStart(workStart));
                    }}
                    max={workEnd - 1}
                  />
                  <View className="w-px h-8 bg-border/30" />
                  <HourStepper
                    label="End"
                    value={workEnd}
                    onChange={(v) => {
                      setWorkEnd(v);
                      persist('default_work_end_hour', v, () => setWorkEnd(workEnd));
                    }}
                    min={workStart + 1}
                  />
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

              {/* ── Google Calendar row ───────────────────────────────── */}
              <CalendarProviderRow
                providerLabel="Google Calendar"
                providerHint={
                  google.isConnected
                    ? 'Connected — events sync automatically'
                    : 'Sync your Google events'
                }
                icon={<GoogleGlyph />}
                state={
                  google.isLoading
                    ? 'loading'
                    : google.isConnected
                      ? 'connected'
                      : 'disconnected'
                }
                isBusy={google.isConnecting}
                onConnect={google.connect}
                onDisconnect={() => {
                  Alert.alert(
                    'Disconnect Google Calendar?',
                    'Your synced busy times will stop updating automatically.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Disconnect',
                        style: 'destructive',
                        onPress: async () => { await google.disconnect(); },
                      },
                    ],
                  );
                }}
              />
              {google.isConnected && (
                <CalendarSyncRow
                  label="Sync Google now"
                  lastSyncedAt={google.lastSyncedAt}
                  lastResult={google.lastSyncResult}
                  isSyncing={google.isSyncing}
                  onSync={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const result = await google.syncCalendar();
                    if (result.synced) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      await loadProfileAndAvailability();
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      Alert.alert('Sync failed', result.message ?? 'Please try again.');
                    }
                  }}
                />
              )}

              {/* ── Apple Calendar (iCloud via Nylas) row ─────────────── */}
              <CalendarProviderRow
                providerLabel="Apple Calendar"
                providerHint={
                  nylas.isConnected
                    ? 'Connected via iCloud'
                    : 'One-click sync via iCloud'
                }
                icon={<AppleGlyph />}
                state={
                  nylas.isLoading
                    ? 'loading'
                    : nylas.isConnected
                      ? 'connected'
                      : 'disconnected'
                }
                isBusy={nylas.isConnecting}
                onConnect={() => nylas.connect('icloud')}
                onDisconnect={() => {
                  Alert.alert(
                    'Disconnect Apple Calendar?',
                    'Your synced busy times will stop updating automatically.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Disconnect',
                        style: 'destructive',
                        onPress: async () => { await nylas.disconnect(); },
                      },
                    ],
                  );
                }}
                topBorder
              />
              {nylas.isConnected && (
                <CalendarSyncRow
                  label="Sync Apple now"
                  lastSyncedAt={nylas.lastSyncedAt}
                  lastResult={nylas.lastSyncResult}
                  isSyncing={nylas.isSyncing}
                  onSync={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const result = await nylas.syncCalendar();
                    if (result.synced) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      await loadProfileAndAvailability();
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      Alert.alert('Sync failed', result.message ?? 'Please try again.');
                    }
                  }}
                />
              )}

              {/* ── Device Calendar (EventKit) — optional offline fallback ── */}
              <View className="px-4 py-3 border-t border-border/20 gap-1">
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Device calendar (optional)
                </Text>
                <View className="flex-row items-center justify-between gap-3 mt-1">
                  <View className="flex-1">
                    <Text className="font-sans text-sm font-medium text-foreground">
                      iPhone Calendar app
                    </Text>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                      {calendarState === 'granted'
                        ? lastSyncAt
                          ? `Last device sync ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                          : 'Permission granted'
                        : 'Pull busy times directly from the iOS Calendar app.'}
                    </Text>
                  </View>
                  {calendarState === 'granted' ? (
                    <Pressable
                      onPress={handleSyncCalendar}
                      disabled={syncing}
                      className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-1.5 active:opacity-70"
                    >
                      {syncing ? (
                        <ActivityIndicator size="small" color="#23744D" />
                      ) : (
                        <>
                          <RefreshCw size={12} color="#23744D" strokeWidth={2.2} />
                          <Text className="font-sans text-xs font-semibold text-primary">
                            Sync
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={handleConnectCalendar}
                      className="bg-muted rounded-xl px-3 py-1.5 active:opacity-80"
                      hitSlop={4}
                    >
                      <Text className="font-sans text-xs font-semibold text-foreground/70">
                        {calendarState === 'denied' ? 'Open Settings' : 'Allow'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
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
