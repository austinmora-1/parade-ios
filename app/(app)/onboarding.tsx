/**
 * Onboarding wizard — 4 steps, runs after first sign-up.
 *
 * Routing gate (app/index.tsx) sends users here whenever
 * profiles.onboarding_completed is false.
 *
 * Steps:
 *   1. About you      — first/last name, optional phone (with uniqueness)
 *   2. Calendar       — request EventKit permission + initial sync
 *   3. Your rhythm    — preferred work days + work-hour range
 *   4. Add friends    — collect email chips (no send-on-complete; user can
 *                       invite later from the Friends tab)
 *
 * Completion → batch UPDATE on profiles (onboarding_completed=true) +
 * redirect to (app)/(tabs).
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
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncCalendarBusyTimes } from '@/lib/calendarSync';
import { TC } from '@/lib/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;
const DAY_LABELS  = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_KEYS    = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am–9pm

function hourLabel(h: number): string {
  if (h === 12) return '12pm';
  if (h === 24 || h === 0) return '12am';
  if (h > 12) return `${h - 12}pm`;
  return `${h}am`;
}

// ─── Profile pre-fetch (don't overwrite existing values) ─────────────────────

function useExistingProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['onboarding-existing-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'first_name, last_name, phone_number, default_work_days, default_work_start_hour, default_work_end_hour',
        )
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as any;
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
            backgroundColor: i <= step ? '#23744D' : 'rgba(146,146,152,0.25)',
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
        style={{ backgroundColor: 'rgba(35,116,77,0.10)' }}
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

// ─── Main ────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const setUserId       = usePlannerStore((s) => s.setUserId);
  const { data: existing } = useExistingProfile(user?.id);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Form state (hydrated from existing values when available) ──────────────
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [phoneState, setPhoneState] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarChecking,  setCalendarChecking]  = useState(false);
  const [workDays,  setWorkDays]  = useState<Set<string>>(
    new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
  );
  const [workStart, setWorkStart] = useState<number>(9);
  const [workEnd,   setWorkEnd]   = useState<number>(17);
  const [friendEmails, setFriendEmails] = useState<string[]>([]);
  const [emailDraft,   setEmailDraft]   = useState('');

  // Hydrate from existing profile if user re-enters wizard
  useEffect(() => {
    if (!existing) return;
    if (existing.first_name) setFirstName(existing.first_name);
    if (existing.last_name)  setLastName(existing.last_name);
    if (existing.phone_number) setPhone(existing.phone_number);
    if (existing.default_work_days && existing.default_work_days.length) {
      setWorkDays(new Set(existing.default_work_days));
    }
    if (typeof existing.default_work_start_hour === 'number') {
      setWorkStart(existing.default_work_start_hour);
    }
    if (typeof existing.default_work_end_hour === 'number') {
      setWorkEnd(existing.default_work_end_hour);
    }
  }, [existing]);

  // Bootstrap planner store for the calendar sync step
  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  // Calendar permission check on mount
  useEffect(() => {
    Calendar.getCalendarPermissionsAsync()
      .then(({ status }) => setCalendarConnected(status === 'granted'))
      .catch(() => {});
  }, []);

  // ── Debounced phone-uniqueness check ───────────────────────────────────────
  useEffect(() => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneState('idle');
      return;
    }
    if (trimmed === (existing?.phone_number ?? '')) {
      setPhoneState('idle');
      return;
    }
    // Loose local format check: digits, +, spaces, parens, hyphens (≥7 digits)
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7) {
      setPhoneState('invalid');
      return;
    }
    setPhoneState('checking');
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc(
          'check_phone_available' as any,
          { p_phone: trimmed },
        );
        if (error) {
          setPhoneState('idle');
          return;
        }
        setPhoneState(data ? 'available' : 'taken');
      } catch {
        setPhoneState('idle');
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [phone, existing?.phone_number]);

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
        // Fire initial sync in background — we don't block onboarding on it
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        syncCalendarBusyTimes(setAvailability, 14).catch(() => {});
      }
    } finally {
      setCalendarChecking(false);
    }
  }, [setAvailability]);

  // ── Email chip helpers ─────────────────────────────────────────────────────
  const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  const addEmail = useCallback(() => {
    const e = emailDraft.trim().toLowerCase();
    if (!isValidEmail(e)) return;
    if (friendEmails.includes(e)) {
      setEmailDraft('');
      return;
    }
    Haptics.selectionAsync();
    setFriendEmails((prev) => [...prev, e]);
    setEmailDraft('');
  }, [emailDraft, friendEmails]);
  const removeEmail = useCallback((email: string) => {
    Haptics.selectionAsync();
    setFriendEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  // ── Finish ─────────────────────────────────────────────────────────────────
  const finish = useCallback(async (skipped: boolean) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        onboarding_completed: true,
      };
      if (!skipped) {
        if (firstName.trim()) updates.first_name = firstName.trim();
        if (lastName.trim())  updates.last_name  = lastName.trim();
        if (phone.trim() && phoneState !== 'taken' && phoneState !== 'invalid') {
          updates.phone_number = phone.trim();
        }
        updates.default_work_days       = [...workDays];
        updates.default_work_start_hour = workStart;
        updates.default_work_end_hour   = workEnd;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates as any)
        .eq('user_id', user.id);
      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(app)/(tabs)');
    } catch (err: any) {
      console.error('Onboarding finish failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Could not save',
        err?.message ?? 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [user?.id, firstName, lastName, phone, phoneState, workDays, workStart, workEnd, queryClient]);

  // ── Step gating — disable Next on invalid steps ────────────────────────────
  const canAdvance = (): boolean => {
    if (saving) return false;
    if (step === 0) {
      if (phoneState === 'taken' || phoneState === 'invalid') return false;
      if (phoneState === 'checking') return false;
    }
    return true;
  };

  const isLast = step === TOTAL_STEPS - 1;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View className="flex-row items-center px-3 py-2 gap-1">
          {step > 0 ? (
            <Pressable
              onPress={goBack}
              hitSlop={8}
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
            onPress={() => finish(true)}
            disabled={saving}
            hitSlop={6}
            className="active:opacity-60"
          >
            <Text className="font-sans text-sm text-muted-foreground">
              Skip
            </Text>
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6 gap-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Step 1: About you ───────────────────────────────────────── */}
          {step === 0 && (
            <>
              <StepHeading
                icon={<Sparkles size={22} color="#23744D" strokeWidth={2} />}
                title="Tell us about you"
                subtitle="Friends will see your name and (optionally) your phone."
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
                <FieldLabel>Phone (optional)</FieldLabel>
                <View className="relative">
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+1 555 123 4567"
                    placeholderTextColor="#929298"
                    keyboardType="phone-pad"
                    className="bg-card rounded-xl border border-border/40 px-4 py-3 pr-10 font-sans text-sm text-foreground shadow-sm"
                    maxLength={30}
                  />
                  <View
                    style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}
                  >
                    {phoneState === 'checking' && (
                      <ActivityIndicator size="small" color="#929298" />
                    )}
                    {phoneState === 'available' && (
                      <Check size={14} color="#23744D" strokeWidth={2.5} />
                    )}
                  </View>
                </View>
                {phoneState === 'taken' && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    That number is already in use.
                  </Text>
                )}
                {phoneState === 'invalid' && (
                  <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
                    Needs at least 7 digits.
                  </Text>
                )}
                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  Used so friends can text-invite you. We never share it.
                </Text>
              </View>
            </>
          )}

          {/* ── Step 2: Calendar ────────────────────────────────────────── */}
          {step === 1 && (
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
                  <View
                    className="flex-row items-center justify-center gap-1.5 bg-primary/10 rounded-xl px-4 py-3 mt-1"
                  >
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

                <Pressable
                  onPress={goNext}
                  className="items-center pt-2 active:opacity-60"
                  hitSlop={6}
                >
                  <Text className="font-sans text-xs text-muted-foreground">
                    {calendarConnected ? '' : 'Maybe later'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {/* ── Step 3: Rhythm ──────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <StepHeading
                icon={<Sparkles size={22} color="#23744D" strokeWidth={2} />}
                title="Your rhythm"
                subtitle="When are you usually working? We'll suggest free time outside these hours."
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
                          selected
                            ? 'bg-primary border-primary'
                            : 'bg-card border-border/40'
                        }`}
                      >
                        <Text
                          className={`font-sans text-sm font-semibold ${
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

              <View>
                <FieldLabel>Work starts</FieldLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 px-0.5 pb-1"
                >
                  {HOURS.filter((h) => h < workEnd).map((h) => {
                    const selected = workStart === h;
                    return (
                      <Chip
                        key={h}
                        selected={selected}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setWorkStart(h);
                        }}
                      >
                        <Text
                          className={`font-sans text-sm font-semibold ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {hourLabel(h)}
                        </Text>
                      </Chip>
                    );
                  })}
                </ScrollView>
              </View>

              <View>
                <FieldLabel>Work ends</FieldLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 px-0.5 pb-1"
                >
                  {HOURS.filter((h) => h > workStart).map((h) => {
                    const selected = workEnd === h;
                    return (
                      <Chip
                        key={h}
                        selected={selected}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setWorkEnd(h);
                        }}
                      >
                        <Text
                          className={`font-sans text-sm font-semibold ${
                            selected ? 'text-white' : 'text-foreground'
                          }`}
                        >
                          {hourLabel(h)}
                        </Text>
                      </Chip>
                    );
                  })}
                </ScrollView>
              </View>

              <View className="bg-primary/8 rounded-xl px-4 py-3 mt-1">
                <Text className="font-sans text-xs text-primary leading-relaxed">
                  You'll be marked working {hourLabel(workStart)}–{hourLabel(workEnd)} on{' '}
                  {[...workDays].length} day{[...workDays].length === 1 ? '' : 's'} a week.
                </Text>
              </View>
            </>
          )}

          {/* ── Step 4: Friends ─────────────────────────────────────────── */}
          {step === 3 && (
            <>
              <StepHeading
                icon={<Users size={22} color="#23744D" strokeWidth={2} />}
                title="Add some friends"
                subtitle="Paste a few emails to remember to invite them. (We won't email anyone yet.)"
              />

              <View>
                <FieldLabel>Friend emails</FieldLabel>
                <View className="flex-row items-center bg-card rounded-xl border border-border/40 px-3 gap-2 shadow-sm">
                  <TextInput
                    value={emailDraft}
                    onChangeText={setEmailDraft}
                    onSubmitEditing={addEmail}
                    placeholder="friend@example.com"
                    placeholderTextColor="#929298"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    className="flex-1 font-sans text-sm text-foreground py-3"
                  />
                  {emailDraft.length > 0 && isValidEmail(emailDraft) && (
                    <Pressable onPress={addEmail} hitSlop={6}>
                      <Text className="font-sans text-sm font-semibold text-primary">
                        Add
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
                  Tap Add (or Return) to chip an email. Skip this step anytime.
                </Text>
              </View>

              {friendEmails.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {friendEmails.map((email) => (
                    <View
                      key={email}
                      className="flex-row items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1.5"
                    >
                      <Text className="font-sans text-xs font-medium text-primary">
                        {email}
                      </Text>
                      <Pressable onPress={() => removeEmail(email)} hitSlop={4}>
                        <XIcon size={12} color="#23744D" strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <View className="bg-muted/40 rounded-xl px-4 py-3 mt-2">
                <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                  When you finish, you can invite these emails from the
                  Friends tab — either by sending an invite link or by
                  searching for them on Parade.
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
              className={`rounded-xl py-3.5 items-center justify-center ${
                canAdvance() ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <Text
                className={`font-sans text-sm font-semibold ${
                  canAdvance() ? 'text-white' : 'text-muted-foreground'
                }`}
              >
                Continue
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => finish(false)}
              disabled={saving}
              className="rounded-xl py-3.5 items-center justify-center bg-primary active:opacity-80"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="font-sans text-sm font-semibold text-white">
                  Done — let's go
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
