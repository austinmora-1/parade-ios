/**
 * Onboarding wizard — the single guided first-run flow.
 *
 * Routing gate (app/index.tsx) sends users here whenever
 * profiles.onboarding_completed is false (true for every brand-new account,
 * including phone-first signups whose profile row starts with a NULL name).
 *
 * Steps:
 *   0. Identity      — first + last name (required) and a username
 *                      (=display_name) with live availability checking
 *   1. Tabs & FAB    — ported feature tour: what each tab does + the + button
 *   2. Calendar      — request EventKit permission + initial sync
 *   3. Preferences   — work-day rhythm + a few profile / social toggles
 *   4. Invite friends— real profile search → pending friend requests, plus a
 *                      share-link fallback (aim for 3)
 *   5. First plan    — mark onboarding complete, then hand off to the FAB
 *                      drawer so the user makes their first plan
 *
 * Completion writes a batch UPDATE on profiles (onboarding_completed=true) and
 * mirrors the verified auth phone into profiles.phone_number. We set the flag
 * BEFORE routing into plan creation so backing out can't strand the user back
 * in onboarding.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Share,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Sparkles,
  Check,
  X as XIcon,
  CalendarDays,
  Users,
  Plus,
  Search,
  UserPlus,
  Share2,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFirstPlanCelebration } from '@/stores/onboardingCelebration';
import { syncCalendarBusyTimes } from '@/lib/calendarSync';
import { formatDisplayName } from '@/lib/utils';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;
const DAY_LABELS  = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_KEYS    = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am–9pm
const INVITE_GOAL = 3;
const { width: SCREEN_W } = Dimensions.get('window');

function hourLabel(h: number): string {
  if (h === 12) return '12pm';
  if (h === 24 || h === 0) return '12am';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
}

// Ported, condensed feature-tour content (was app/(app)/tour.tsx).
const TOUR_SLIDES = [
  {
    icon: <Plus size={30} color="#FFFFFF" strokeWidth={2.5} />,
    iconBg: '#23744D',
    eyebrow: 'The + button',
    title: 'Three ways to plan',
    body: 'Tap the floating + on Home to find time with friends, drop an open invite, or mark a trip.',
  },
  {
    icon: <Users size={26} color="#23744D" strokeWidth={2.2} />,
    iconBg: TINT.primarySubtle,
    eyebrow: 'Home tab',
    title: "Who's around",
    body: 'See friends’ current vibe and how many days they’re free this week. Tap a pill to open their profile.',
  },
  {
    icon: <Sparkles size={26} color="#DFA53A" strokeWidth={2.2} />,
    iconBg: TINT.marigoldSubtle,
    eyebrow: 'Recommended',
    title: 'Your free windows',
    body: 'Open time you’ve marked, sorted by friend overlap. Tap a chip to plan something then.',
  },
  {
    icon: <CalendarDays size={26} color="#23744D" strokeWidth={2.2} />,
    iconBg: TINT.primarySubtle,
    eyebrow: 'Plans tab',
    title: 'Your week & trips',
    body: 'Mark availability with a tap, see plans by day, navigate weeks, and add trips.',
  },
  {
    icon: <SettingsIcon size={26} color="#929298" strokeWidth={2.2} />,
    iconBg: TINT.grayFaint,
    eyebrow: 'Profile tab',
    title: 'Make it yours',
    body: 'Sync your calendar, control notifications, and choose what friends can see.',
  },
];

// ─── Profile pre-fetch (don't overwrite existing values) ─────────────────────

function useExistingProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['onboarding-existing-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'first_name, last_name, display_name, phone_number, default_work_days, default_work_start_hour, default_work_end_hour, show_availability, show_vibe_status, discoverable, preferred_social_days',
        )
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as any;
    },
  });
}

// ─── Friend search (mirrors add-friend.tsx) ──────────────────────────────────

interface ProfileMatch {
  user_id:      string;
  display_name: string | null;
  first_name:   string | null;
  last_name:    string | null;
  avatar_url:   string | null;
}

function useProfileSearch(query: string, enabled: boolean) {
  const trimmed = query.trim();
  return useQuery({
    enabled: enabled && trimmed.length >= 2,
    queryKey: ['onboarding-profile-search', trimmed],
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileMatch[]> => {
      const { data, error } = await (supabase as any)
        .rpc('search_profiles', { p_query: trimmed });
      if (error) throw error;
      return (data ?? []) as ProfileMatch[];
    },
  });
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <View className="flex-row gap-1.5 px-1">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          className="flex-1 h-1 rounded-full"
          style={{
            backgroundColor: i <= step ? '#23744D' : TINT.grayBorder,
          }}
        />
      ))}
    </View>
  );
}

function StepHeading({ icon, title, subtitle }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View className="items-center gap-2 py-4">
      <View
        className="w-12 h-12 rounded-2xl items-center justify-center"
        style={{ backgroundColor: TINT.primarySubtle }}
      >
        {icon}
      </View>
      <Text className="font-display text-2xl text-foreground text-center">
        {title}
      </Text>
      <Text className="font-sans text-sm text-muted-foreground text-center px-4">
        {subtitle}
      </Text>
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
      }`}
    >
      {children}
    </Pressable>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between bg-card rounded-xl border border-border/40 px-4 py-3 shadow-sm">
      <View className="flex-1 pr-3">
        <Text className="font-sans text-sm font-semibold text-foreground">{title}</Text>
        <Text className="font-sans text-xs text-muted-foreground mt-0.5">{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { Haptics.selectionAsync(); onValueChange(v); }}
        trackColor={{ false: TINT.grayBorder, true: '#23744D' }}
      />
    </View>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const setUserId       = usePlannerStore((s) => s.setUserId);
  const addFriend       = usePlannerStore((s) => s.addFriend);
  const armCelebration  = useFirstPlanCelebration((s) => s.arm);
  const { data: existing } = useExistingProfile(user?.id);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Form state (hydrated from existing values when available) ──────────────
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [displayName, setDisplayName] = useState('');
  const [usernameState, setUsernameState] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarChecking,  setCalendarChecking]  = useState(false);
  const [workDays,  setWorkDays]  = useState<Set<string>>(
    new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
  );
  const [workStart, setWorkStart] = useState<number>(9);
  const [workEnd,   setWorkEnd]   = useState<number>(17);

  // Social preferences
  const [showAvailability, setShowAvailability] = useState(true);
  const [showVibeStatus,   setShowVibeStatus]   = useState(true);
  const [discoverable,     setDiscoverable]     = useState(true);
  const [socialDays, setSocialDays] = useState<Set<string>>(new Set());

  // Invite-friends state
  const [searchQuery,  setSearchQuery]  = useState('');
  const [invitedIds,   setInvitedIds]   = useState<Set<string>>(new Set());
  const [sendingId,    setSendingId]    = useState<string | null>(null);
  const { data: matches, isFetching: searching } =
    useProfileSearch(searchQuery, step === 4);

  // Hydrate from existing profile if user re-enters wizard
  useEffect(() => {
    if (!existing) return;
    if (existing.first_name) setFirstName(existing.first_name);
    if (existing.last_name)  setLastName(existing.last_name);
    if (existing.display_name) setDisplayName(existing.display_name);
    if (existing.default_work_days && existing.default_work_days.length) {
      setWorkDays(new Set(existing.default_work_days));
    }
    if (typeof existing.default_work_start_hour === 'number') {
      setWorkStart(existing.default_work_start_hour);
    }
    if (typeof existing.default_work_end_hour === 'number') {
      setWorkEnd(existing.default_work_end_hour);
    }
    if (typeof existing.show_availability === 'boolean') setShowAvailability(existing.show_availability);
    if (typeof existing.show_vibe_status === 'boolean')  setShowVibeStatus(existing.show_vibe_status);
    if (typeof existing.discoverable === 'boolean')      setDiscoverable(existing.discoverable);
    if (existing.preferred_social_days?.length) {
      setSocialDays(new Set(existing.preferred_social_days));
    }
  }, [existing]);

  // Bootstrap planner store for the calendar sync + friend-request steps
  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  // Calendar permission check on mount
  useEffect(() => {
    Calendar.getCalendarPermissionsAsync()
      .then(({ status }) => setCalendarConnected(status === 'granted'))
      .catch(() => {});
  }, []);

  // ── Debounced username availability check ──────────────────────────────────
  useEffect(() => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setUsernameState('idle');
      return;
    }
    // Unchanged from the saved value → already theirs, treat as available.
    if (trimmed === (existing?.display_name ?? '')) {
      setUsernameState('available');
      return;
    }
    if (trimmed.length < 3) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('check_username_available', {
          p_username: trimmed,
        });
        if (error) { setUsernameState('idle'); return; }
        setUsernameState(data ? 'available' : 'taken');
      } catch {
        setUsernameState('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [displayName, existing?.display_name]);

  // ── Step navigation ────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    Haptics.selectionAsync();
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);
  const goBack = useCallback(() => {
    Haptics.selectionAsync();
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  // ── Calendar permission flow ───────────────────────────────────────────────
  const handleConnectCalendar = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCalendarChecking(true);
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      const granted = status === 'granted';
      setCalendarConnected(granted);
      if (granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        syncCalendarBusyTimes(setAvailability, 14).catch(() => {});
      }
    } finally {
      setCalendarChecking(false);
    }
  }, [setAvailability]);

  // ── Friend request / share helpers ─────────────────────────────────────────
  const handleSendRequest = useCallback(async (m: ProfileMatch) => {
    if (invitedIds.has(m.user_id)) return;
    setSendingId(m.user_id);
    try {
      const name = formatDisplayName({
        firstName: m.first_name,
        lastName: m.last_name,
        displayName: m.display_name,
      });
      await addFriend({ name, friendUserId: m.user_id, status: 'pending' });
      setInvitedIds((prev) => new Set(prev).add(m.user_id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Friend request failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingId(null);
    }
  }, [addFriend, invitedIds]);

  const handleShareInvite = useCallback(async () => {
    try {
      await Share.share({
        message:
          "Join me on Parade — let's hang out IRL more often. https://helloparade.app",
      });
    } catch {
      /* user cancelled */
    }
  }, []);

  // ── Finish ─────────────────────────────────────────────────────────────────
  const finish = useCallback(async (
    skipped: boolean,
    dest: 'plan' | 'home',
  ) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        onboarding_completed: true,
      };

      // Mirror the verified auth phone into the profile (used by friend
      // text-invites, check_phone_available, search). Don't overwrite an
      // existing value.
      const authPhone = (user as any).phone as string | undefined;
      if (authPhone && !existing?.phone_number) {
        updates.phone_number = authPhone.startsWith('+') ? authPhone : `+${authPhone}`;
      }

      if (!skipped) {
        if (firstName.trim()) updates.first_name = firstName.trim();
        if (lastName.trim())  updates.last_name  = lastName.trim();
        if (displayName.trim() && usernameState === 'available') {
          updates.display_name = displayName.trim();
        }
        updates.default_work_days       = [...workDays];
        updates.default_work_start_hour = workStart;
        updates.default_work_end_hour   = workEnd;
        updates.show_availability       = showAvailability;
        updates.show_vibe_status        = showVibeStatus;
        updates.discoverable            = discoverable;
        updates.preferred_social_days   = [...socialDays];
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates as any)
        .eq('user_id', user.id);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Flag is already persisted, so routing into plan creation can't strand
      // the user back here if they bail out.
      if (dest === 'plan') {
        // Arm the first-plan celebration: the global watcher fires confetti +
        // sends the user Home the moment their plan count exceeds this baseline.
        armCelebration(usePlannerStore.getState().plans.length);
        // Land on Home first, THEN open the plan-picker drawer on top — so
        // that closing/​backing out of plan creation returns to Home instead
        // of dead-ending (onboarding was reached via replace, leaving no base
        // screen for GO_BACK).
        router.replace('/(app)/(tabs)');
        router.push('/(app)/what-planning');
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      console.error('Onboarding finish failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user, existing?.phone_number, firstName, lastName, displayName, usernameState,
      workDays, workStart, workEnd, showAvailability, showVibeStatus, discoverable,
      socialDays, queryClient, armCelebration]);

  // ── Step gating — disable Next on invalid steps ────────────────────────────
  const canAdvance = (): boolean => {
    if (saving) return false;
    if (step === 0) {
      if (!firstName.trim() || !lastName.trim()) return false;
      if (usernameState !== 'available') return false;
    }
    return true;
  };

  const isLast = step === TOTAL_STEPS - 1;
  const sentCount = invitedIds.size;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header — back (any step past the first) + exit (every step) */}
        <View className="flex-row items-center px-3 py-2 gap-1">
          {step > 0 ? (
            <Pressable
              onPress={goBack}
              disabled={saving}
              hitSlop={8}
              accessibilityLabel="Go back"
              className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
            >
              <ChevronLeft size={22} color={TC.icon} strokeWidth={2} />
            </Pressable>
          ) : (
            <View className="w-9 h-9" />
          )}
          <View className="flex-1 mx-2">
            <ProgressBar step={step} />
          </View>
          <Pressable
            onPress={() => finish(true, 'home')}
            disabled={saving}
            hitSlop={6}
            accessibilityLabel="Skip onboarding"
            className="flex-row items-center gap-1 pl-2 active:opacity-60"
          >
            <Text className="font-sans text-sm text-muted-foreground">Skip</Text>
            <XIcon size={18} color={TC.icon} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6 gap-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Step 0: Identity ────────────────────────────────────────── */}
          {step === 0 && (
            <>
              <StepHeading
                icon={<Sparkles size={22} color="#23744D" strokeWidth={2} />}
                title="Tell us about you"
                subtitle="Your name helps friends find you. Your username is how you'll appear."
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <FieldLabel>First name</FieldLabel>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First"
                    placeholderTextColor="#929298"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    maxLength={40}
                    autoCapitalize="words"
                    autoFocus
                  />
                </View>
                <View className="flex-1">
                  <FieldLabel>Last name</FieldLabel>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last"
                    placeholderTextColor="#929298"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    maxLength={40}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View>
                <FieldLabel>Username</FieldLabel>
                <View className="relative">
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="how friends see you"
                    placeholderTextColor="#929298"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 pr-10 font-sans text-sm text-foreground shadow-sm"
                    maxLength={30}
                  />
                  <View
                    style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}
                  >
                    {usernameState === 'checking' && (
                      <ActivityIndicator size="small" color="#929298" />
                    )}
                    {usernameState === 'available' && (
                      <Check size={14} color="#23744D" strokeWidth={2.5} />
                    )}
                  </View>
                </View>
                {usernameState === 'taken' && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    That username is taken — try another.
                  </Text>
                )}
                {usernameState === 'invalid' && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    At least 3 characters.
                  </Text>
                )}
              </View>
            </>
          )}

          {/* ── Step 1: Tabs & FAB tour ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <StepHeading
                icon={<Sparkles size={22} color="#23744D" strokeWidth={2} />}
                title="A quick tour"
                subtitle="Swipe through the basics — you can replay this anytime in Settings."
              />
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20 }}
              >
                {TOUR_SLIDES.map((s, i) => (
                  <View
                    key={i}
                    style={{ width: SCREEN_W }}
                    className="items-center px-8 py-2"
                  >
                    <View
                      className="w-20 h-20 rounded-3xl items-center justify-center"
                      style={{ backgroundColor: s.iconBg }}
                    >
                      {s.icon}
                    </View>
                    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary mt-5">
                      {s.eyebrow}
                    </Text>
                    <Text className="font-display text-2xl text-foreground text-center mt-2">
                      {s.title}
                    </Text>
                    <Text className="font-sans text-sm text-muted-foreground text-center mt-3 leading-relaxed">
                      {s.body}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Step 2: Calendar ────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <StepHeading
                icon={<CalendarDays size={22} color="#23744D" strokeWidth={2} />}
                title="Connect your calendar"
                subtitle="We'll mark times you're booked as busy — without you typing them in."
              />

              <View className="bg-card rounded-2xl border border-border/30 p-5 gap-3 shadow-sm">
                <Text className="font-sans text-sm text-foreground leading-relaxed">
                  Parade reads your iPhone Calendar in the background.
                  Events you remove free the slot back up automatically.
                </Text>
                <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                  You can disconnect anytime in Settings or in iOS Privacy.
                </Text>

                {calendarConnected ? (
                  <View className="flex-row items-center justify-center gap-1.5 bg-primary/10 rounded-xl px-4 py-3 mt-1">
                    <Check size={14} color="#23744D" strokeWidth={2.5} />
                    <Text className="font-sans text-sm font-semibold text-primary">
                      Calendar connected
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleConnectCalendar}
                    disabled={calendarChecking}
                    className="flex-row items-center justify-center gap-1.5 bg-primary rounded-xl px-4 py-3 mt-1 active:opacity-80"
                  >
                    {calendarChecking ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <CalendarDays size={14} color="#FFFFFF" strokeWidth={2.2} />
                        <Text className="font-sans text-sm font-semibold text-white">
                          Connect Calendar
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* ── Step 3: Preferences (rhythm + social) ───────────────────── */}
          {step === 3 && (
            <>
              <StepHeading
                icon={<Sparkles size={22} color="#23744D" strokeWidth={2} />}
                title="Your preferences"
                subtitle="When you're usually working, and what friends can see."
              />

              <View>
                <FieldLabel>Work days</FieldLabel>
                <View className="flex-row gap-1.5">
                  {DAY_KEYS.map((key, i) => {
                    const selected = workDays.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setWorkDays((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        className={`flex-1 h-11 rounded-xl border items-center justify-center active:opacity-70 ${
                          selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                        }`}
                      >
                        <Text className={`font-sans text-sm font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>
                          {DAY_LABELS[i]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <FieldLabel>Work starts</FieldLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                  {HOURS.filter((h) => h < workEnd).map((h) => (
                    <Chip key={h} selected={workStart === h} onPress={() => { Haptics.selectionAsync(); setWorkStart(h); }}>
                      <Text className={`font-sans text-sm font-semibold ${workStart === h ? 'text-white' : 'text-foreground'}`}>
                        {hourLabel(h)}
                      </Text>
                    </Chip>
                  ))}
                </ScrollView>
              </View>

              <View>
                <FieldLabel>Work ends</FieldLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                  {HOURS.filter((h) => h > workStart).map((h) => (
                    <Chip key={h} selected={workEnd === h} onPress={() => { Haptics.selectionAsync(); setWorkEnd(h); }}>
                      <Text className={`font-sans text-sm font-semibold ${workEnd === h ? 'text-white' : 'text-foreground'}`}>
                        {hourLabel(h)}
                      </Text>
                    </Chip>
                  ))}
                </ScrollView>
              </View>

              <View className="gap-2 mt-1">
                <FieldLabel>What friends can see</FieldLabel>
                <ToggleRow
                  title="Show my availability"
                  subtitle="Friends can see your free days this week."
                  value={showAvailability}
                  onValueChange={setShowAvailability}
                />
                <ToggleRow
                  title="Show my vibe"
                  subtitle="Friends see your current status / vibe."
                  value={showVibeStatus}
                  onValueChange={setShowVibeStatus}
                />
                <ToggleRow
                  title="Discoverable"
                  subtitle="Let friends find you by name or username."
                  value={discoverable}
                  onValueChange={setDiscoverable}
                />
              </View>

              <View>
                <FieldLabel>Days you'd like to be social</FieldLabel>
                <View className="flex-row gap-1.5">
                  {DAY_KEYS.map((key, i) => {
                    const selected = socialDays.has(key);
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSocialDays((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        className={`flex-1 h-11 rounded-xl border items-center justify-center active:opacity-70 ${
                          selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                        }`}
                      >
                        <Text className={`font-sans text-sm font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>
                          {DAY_LABELS[i]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* ── Step 4: Invite friends ──────────────────────────────────── */}
          {step === 4 && (
            <>
              <StepHeading
                icon={<Users size={22} color="#23744D" strokeWidth={2} />}
                title="Add a few friends"
                subtitle={`Parade is better together — try to add ${INVITE_GOAL}.`}
              />

              {/* Progress toward the goal */}
              <View className="flex-row items-center justify-center gap-2">
                {Array.from({ length: INVITE_GOAL }).map((_, i) => (
                  <View
                    key={i}
                    className="h-2 rounded-full"
                    style={{
                      width: 28,
                      backgroundColor: i < sentCount ? '#23744D' : TINT.grayBorder,
                    }}
                  />
                ))}
                <Text className="font-sans text-xs text-muted-foreground ml-1">
                  {sentCount}/{INVITE_GOAL}
                </Text>
              </View>

              <View className="flex-row items-center bg-card rounded-xl border border-border/40 px-3 gap-2 shadow-sm">
                <Search size={16} color="#929298" strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by name or username"
                  placeholderTextColor="#929298"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="flex-1 font-sans text-sm text-foreground py-3"
                />
                {searching && <ActivityIndicator size="small" color="#929298" />}
              </View>

              {/* Results */}
              {(matches ?? []).map((m) => {
                const name = formatDisplayName({
                  firstName: m.first_name,
                  lastName: m.last_name,
                  displayName: m.display_name,
                });
                const requested = invitedIds.has(m.user_id);
                return (
                  <View
                    key={m.user_id}
                    className="flex-row items-center bg-card rounded-xl border border-border/30 px-4 py-3 gap-3 shadow-sm"
                  >
                    <View className="flex-1">
                      <Text className="font-sans text-sm font-semibold text-foreground">{name}</Text>
                      {m.display_name ? (
                        <Text className="font-sans text-xs text-muted-foreground">@{m.display_name}</Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => handleSendRequest(m)}
                      disabled={requested || sendingId === m.user_id}
                      className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                        requested ? 'bg-primary/10' : 'bg-primary active:opacity-80'
                      }`}
                    >
                      {sendingId === m.user_id ? (
                        <ActivityIndicator size="small" color="#23744D" />
                      ) : requested ? (
                        <>
                          <Check size={13} color="#23744D" strokeWidth={2.5} />
                          <Text className="font-sans text-xs font-semibold text-primary">Sent</Text>
                        </>
                      ) : (
                        <>
                          <UserPlus size={13} color="#FFFFFF" strokeWidth={2.2} />
                          <Text className="font-sans text-xs font-semibold text-white">Add</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}

              {searchQuery.trim().length >= 2 && !searching && (matches ?? []).length === 0 && (
                <Text className="font-sans text-xs text-muted-foreground text-center px-4">
                  No one found. Invite them with a link instead.
                </Text>
              )}

              {/* Share-link fallback */}
              <Pressable
                onPress={handleShareInvite}
                className="flex-row items-center justify-center gap-2 bg-card rounded-xl border border-border/40 px-4 py-3 mt-1 active:opacity-80 shadow-sm"
              >
                <Share2 size={15} color="#23744D" strokeWidth={2.2} />
                <Text className="font-sans text-sm font-semibold text-primary">
                  Share an invite link
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Step 5: First plan ──────────────────────────────────────── */}
          {step === 5 && (
            <>
              <StepHeading
                icon={<Plus size={22} color="#23744D" strokeWidth={2} />}
                title="Make your first plan"
                subtitle="You're all set. Let's get something on the calendar."
              />
              <View className="bg-primary/8 rounded-2xl px-5 py-4">
                <Text className="font-sans text-sm text-primary leading-relaxed">
                  We'll open the + menu so you can find time with friends, drop
                  an open invite, or plan a trip. You can always do this later
                  from the Home tab.
                </Text>
              </View>
            </>
          )}
        </ScrollView>

        {/* Footer */}
        <View className="px-5 pb-2 pt-2 border-t border-border/20">
          {!isLast ? (
            <Pressable
              onPress={goNext}
              disabled={!canAdvance()}
              className={`rounded-xl py-3.5 items-center justify-center ${canAdvance() ? 'bg-primary' : 'bg-muted'}`}
            >
              <Text className={`font-sans text-sm font-semibold ${canAdvance() ? 'text-white' : 'text-muted-foreground'}`}>
                Continue
              </Text>
            </Pressable>
          ) : (
            <View className="gap-2">
              <Pressable
                onPress={() => finish(false, 'plan')}
                disabled={saving}
                className="rounded-xl py-3.5 items-center justify-center bg-primary active:opacity-80"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="font-sans text-sm font-semibold text-white">
                    Make my first plan
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => finish(false, 'home')}
                disabled={saving}
                hitSlop={6}
                className="items-center py-1 active:opacity-60"
              >
                <Text className="font-sans text-xs text-muted-foreground">
                  I'll do this later
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
