/**
 * Settings page — Phase 2 Block 7 wired toggles.
 *
 * Sections:
 *   - Appearance: Auto Night Mode → device-local MMKV via lib/theme
 *     (applies immediately, not part of the batched Save)
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import { LogOut } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncCalendarBusyTimes, getLastSyncTime } from '@/lib/calendarSync';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useNylasCalendar } from '@/hooks/useNylasCalendar';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { useProfileSettings } from '@/components/settings/useProfileSettings';
import { SectionCard, SectionHeader } from '@/components/settings/SettingsPrimitives';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { SocialPreferencesSection } from '@/components/settings/SocialPreferencesSection';
import { CalendarSection } from '@/components/settings/CalendarSection';

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
  // Legacy per-field saving indicator — disabled now that Save is batched.
  // Toggles never disable themselves; the global Save button reflects state.
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

  // ── Dirty-tracking save ───────────────────────────────────────────────────
  // Settings used to auto-save each field on change. Now we accumulate
  // changes locally and commit them on the explicit Save button tap.
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [savingAll, setSavingAll] = useState(false);

  // Track local state as it diverges from the server snapshot
  const markDirty = useCallback(
    (column: string, value: any) => {
      Haptics.selectionAsync();
      setPendingChanges((prev) => ({ ...prev, [column]: value }));
    },
    [],
  );

  // Commit every pending change in a single profiles update
  const saveAll = useCallback(async () => {
    if (!user?.id) return;
    const keys = Object.keys(pendingChanges);
    if (keys.length === 0) return;
    setSavingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const { error } = await supabase
        .from('profiles')
        .update(pendingChanges as any)
        .eq('user_id', user.id);
      if (error) throw error;
      // Refresh the planner store so changes to default_work_days /
      // work hours propagate into newly-generated default availability
      // immediately (Home dashboard pulls from this store).
      await loadProfileAndAvailability();
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPendingChanges({});
    } catch (err: any) {
      console.error('Settings saveAll failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSavingAll(false);
    }
  }, [user?.id, pendingChanges, loadProfileAndAvailability, refetch]);

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
      markDirty(column, next);
    },
    [markDirty],
  );

  const hasUnsavedChanges = Object.keys(pendingChanges).length > 0;

  // Guard against losing edits when the user taps Back
  const handleBack = useCallback(() => {
    if (!hasUnsavedChanges) {
      router.back();
      return;
    }
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes to your settings.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setPendingChanges({});
            router.back();
          },
        },
      ],
    );
  }, [hasUnsavedChanges]);

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

  // ── Toggle handlers (dirty-tracking, no auto-save) ───────────────────────
  const onTogglePlanReminders = (v: boolean) => {
    setReminders(v);
    markDirty('plan_reminders', v);
  };
  const onToggleFriendReq = (v: boolean) => {
    setFriendReq(v);
    markDirty('friend_requests_notifications', v);
  };
  const onTogglePlanInvites = (v: boolean) => {
    setPlanInvites(v);
    markDirty('plan_invitations_notifications', v);
  };
  const onToggleShowAvail = (v: boolean) => {
    setShowAvail(v);
    markDirty('show_availability', v);
  };
  const onToggleShowLocation = (v: boolean) => {
    setShowLocation(v);
    markDirty('show_location', v);
  };
  const onToggleShowVibe = (v: boolean) => {
    setShowVibe(v);
    markDirty('show_vibe_status', v);
  };
  const onToggleAllowHang = (v: boolean) => {
    setAllowHang(v);
    markDirty('allow_all_hang_requests', v);
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title="Settings"
        subtitle={
          hasUnsavedChanges
            ? 'Unsaved changes'
            : 'Manage your account and preferences'
        }
        onBack={handleBack}
        rightAction={
          <Pressable
            onPress={saveAll}
            disabled={!hasUnsavedChanges || savingAll}
            hitSlop={6}
            className={`rounded-xl px-3 py-1.5 ${
              hasUnsavedChanges ? 'bg-primary active:opacity-80' : 'bg-muted'
            }`}
          >
            {savingAll ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                className={`font-sans text-sm font-semibold ${
                  hasUnsavedChanges ? 'text-white' : 'text-muted-foreground'
                }`}
              >
                Save
              </Text>
            )}
          </Pressable>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10 gap-3"
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator className="mt-12" color="#23744D" />
        ) : (
          <>
            {/* ── Appearance ──────────────────────────────────────────── */}
            <AppearanceSection />

            {/* ── Notifications ───────────────────────────────────────── */}
            <NotificationsSection
              reminders={reminders}
              friendReq={friendReq}
              planInvites={planInvites}
              onTogglePlanReminders={onTogglePlanReminders}
              onToggleFriendReq={onToggleFriendReq}
              onTogglePlanInvites={onTogglePlanInvites}
            />

            {/* ── Privacy ─────────────────────────────────────────────── */}
            <PrivacySection
              showAvail={showAvail}
              showLocation={showLocation}
              showVibe={showVibe}
              allowHang={allowHang}
              onToggleShowAvail={onToggleShowAvail}
              onToggleShowLocation={onToggleShowLocation}
              onToggleShowVibe={onToggleShowVibe}
              onToggleAllowHang={onToggleAllowHang}
            />

            {/* ── Social preferences ──────────────────────────────────── */}
            <SocialPreferencesSection
              interests={interests}
              prefDays={prefDays}
              prefTimes={prefTimes}
              workDays={workDays}
              workStart={workStart}
              workEnd={workEnd}
              onToggleInterest={(opt) =>
                toggleArrayValue('interests', interests, setInterests, opt)
              }
              onTogglePrefDay={(key) =>
                toggleArrayValue('preferred_social_days', prefDays, setPrefDays, key)
              }
              onTogglePrefTime={(id) =>
                toggleArrayValue('preferred_social_times', prefTimes, setPrefTimes, id)
              }
              onToggleWorkDay={(key) =>
                toggleArrayValue('default_work_days', workDays, setWorkDays, key)
              }
              onWorkStartChange={(v) => {
                setWorkStart(v);
                markDirty('default_work_start_hour', v);
              }}
              onWorkEndChange={(v) => {
                setWorkEnd(v);
                markDirty('default_work_end_hour', v);
              }}
            />

            {/* ── Calendar ────────────────────────────────────────────── */}
            <CalendarSection
              google={google}
              nylas={nylas}
              calendarState={calendarState}
              syncing={syncing}
              lastSyncAt={lastSyncAt}
              onConnectDeviceCalendar={handleConnectCalendar}
              onSyncDeviceCalendar={handleSyncCalendar}
              loadProfileAndAvailability={loadProfileAndAvailability}
            />

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
