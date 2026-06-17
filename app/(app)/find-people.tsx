/**
 * "Find friends to join" — open-invite broadcast wizard (matches the PWA's
 * FindPeopleSheet: describe → audience → preview → sent).
 *
 *   Step 1  Describe — anchor to an existing upcoming plan (prefills) or
 *            fill title / activity / date / time / location / notes.
 *   Step 2  Audience — all friends · specific friends · a pod · an interest.
 *   Step 3  Preview  — exactly what recipients see + reach + 48h expiry.
 *   Step 4  Sent     — confirmation.
 *
 * Submit writes an open_invites row (audience_type/audience_ref/expires_at)
 * and fires the on-open-invite edge fn — NOT a plans row, so PWA + iOS
 * recipient surfaces both see it and the first claimer spawns the plan.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, isSameDay, isToday, isTomorrow, addHours } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  X, Check, ChevronLeft, ChevronRight, Megaphone, Users as UsersIcon,
  Sparkles, Clock, MapPin, CalendarCheck,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { usePods } from '@/hooks/usePods';
import { useCreateOpenInvite, type OpenInviteAudienceType } from '@/hooks/useOpenInvites';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { TIME_SLOT_LABELS, type TimeSlot } from '@/types/planner';
import { isNonSocialImport } from '@/lib/planSource';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

const ACTIVITIES = [
  { id: 'drinks', label: 'Drinks', emoji: '🍹' },
  { id: 'dinner', label: 'Dinner', emoji: '🍝' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'happy-hour', label: 'Happy hour', emoji: '🍻' },
  { id: 'hike', label: 'Hike', emoji: '🥾' },
  { id: 'movie', label: 'Movie', emoji: '🎬' },
  { id: 'concert', label: 'Concert', emoji: '🎵' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'meetup', label: 'Meetup', emoji: '👋' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

const SLOTS = Object.entries(TIME_SLOT_LABELS) as [TimeSlot, { label: string; time: string }][];

const INTEREST_OPTIONS = [
  'Foodie', 'Outdoors', 'Movies', 'Concerts', 'Sports', 'Reading',
  'Travel', 'Art', 'Gaming', 'Music', 'Cooking', 'Yoga', 'Coffee',
  'Cocktails', 'Nightlife', 'Photography', 'Hiking', 'Fitness',
];

function dateLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

function StepDots({ step }: { step: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: i === step ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === step ? TC.primary : TINT.grayBorder,
          }}
        />
      ))}
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

function Chip({ selected, onPress, children }: {
  selected: boolean; onPress: () => void; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border flex-row items-center gap-1.5 active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
      }`}
    >
      {children}
    </Pressable>
  );
}

type Audience =
  | { type: 'all_friends' }
  | { type: 'friends'; ids: string[] }
  | { type: 'pod'; id: string }
  | { type: 'interest'; tag: string };

export default function FindPeopleScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans = usePlannerStore((s) => s.plans);
  const { data: pods } = usePods();
  const createMut = useCreateOpenInvite();

  const connectedFriends = useMemo(
    () => friends.filter((f) => f.status === 'connected' && f.friendUserId),
    [friends],
  );

  // My display name for the preview message
  const { data: myName } = useQuery({
    enabled: !!user?.id,
    queryKey: ['my-display-name-simple', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as any)?.first_name || (data as any)?.display_name || 'A friend';
    },
  });

  // Upcoming plans I own — anchor candidates. Non-social calendar imports
  // (holidays/birthdays + flight & hotel reservations) are filtered out:
  // they're logistics, not plans someone would broadcast.
  const anchorPlans = useMemo(() => {
    const now = new Date();
    return plans
      .filter((p) => {
        const d = p.date instanceof Date ? p.date : new Date(p.date);
        return d >= now && !isNonSocialImport(p);
      })
      .slice(0, 10);
  }, [plans]);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1 — describe
  const [anchorPlanId, setAnchorPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState('drinks');
  const [date, setDate] = useState<Date>(new Date());
  const [timeSlot, setTimeSlot] = useState<TimeSlot>('evening');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  // Optional pre-selected friend(s) by friendUserId — e.g. opened from an
  // iMessage "ask friends to join" bubble carrying the sender as ?preFriend=.
  const { preFriend } = useLocalSearchParams<{ preFriend?: string }>();

  // Step 2 — audience
  const [audience, setAudience] = useState<Audience>(() => {
    const ids = preFriend ? preFriend.split(',').filter(Boolean) : [];
    return ids.length > 0 ? { type: 'friends', ids } : { type: 'all_friends' };
  });

  const dateOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)),
    [],
  );

  // Step 1 chooser: pick an existing plan (prefills describe) or start fresh.
  const pickAnchor = useCallback((p: any | null) => {
    Haptics.selectionAsync();
    if (!p) {
      // "Create a new plan" — clear any previous anchor prefill
      setAnchorPlanId(null);
      setStep(2);
      return;
    }
    setAnchorPlanId(p.id);
    setTitle(p.title ?? '');
    if (p.activity) setActivity(p.activity);
    setDate(p.date instanceof Date ? p.date : new Date(p.date));
    if (p.timeSlot) setTimeSlot(p.timeSlot as TimeSlot);
    setLocation(typeof p.location === 'string' ? p.location : p.location?.name ?? '');
    if (p.notes) setNotes(p.notes);
    setStep(2);
  }, []);

  const toggleAudienceFriend = useCallback((fid: string) => {
    Haptics.selectionAsync();
    setAudience((prev) => {
      const ids = prev.type === 'friends' ? [...prev.ids] : [];
      const idx = ids.indexOf(fid);
      idx >= 0 ? ids.splice(idx, 1) : ids.push(fid);
      return { type: 'friends', ids };
    });
  }, []);

  // Reach estimate for the preview
  const reach = useMemo(() => {
    switch (audience.type) {
      case 'all_friends':
        return { label: 'All friends', count: connectedFriends.length };
      case 'friends':
        return { label: 'Specific friends', count: audience.ids.length };
      case 'pod': {
        const pod = (pods ?? []).find((p) => p.id === audience.id);
        const members = (pod?.memberIds ?? []).filter((id) =>
          connectedFriends.some((f) => f.friendUserId === id),
        );
        return { label: `${pod?.emoji ?? '💜'} ${pod?.name ?? 'Pod'}`, count: members.length };
      }
      case 'interest':
        return { label: `Friends into ${audience.tag}`, count: null };
    }
  }, [audience, connectedFriends, pods]);

  const canNext1 = title.trim().length > 0;
  const canNext2 =
    audience.type === 'all_friends' ||
    (audience.type === 'friends' && audience.ids.length > 0) ||
    audience.type === 'pod' ||
    audience.type === 'interest';

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const audienceRef =
        audience.type === 'friends' ? audience.ids.join(',')
        : audience.type === 'pod' ? audience.id
        : audience.type === 'interest' ? audience.tag
        : null;
      await createMut.mutateAsync({
        title: title.trim(),
        activity,
        date: format(date, 'yyyy-MM-dd'),
        time_slot: timeSlot,
        location: location.trim() || null,
        notes: notes.trim() || null,
        audience_type: audience.type as OpenInviteAudienceType,
        audience_ref: audienceRef,
        plan_id: anchorPlanId,
        expires_at: addHours(new Date(), 48).toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(5);
    } catch (err: any) {
      console.error('open invite send failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not send invite', err?.message ?? 'Please try again.');
    }
  }, [audience, title, activity, date, timeSlot, location, notes, anchorPlanId, createMut]);

  const stepTitle =
    step === 1 ? 'What are you broadcasting?'
    : step === 2 ? anchorPlanId ? 'Check the details' : "What's the plan?"
    : step === 3 ? 'Who should see it?'
    : step === 4 ? 'Preview'
    : 'Invite sent';

  const goBack = () => (step === 1 || step === 5 ? router.back() : setStep((s) => (s - 1) as any));
  const slotMeta = TIME_SLOT_LABELS[timeSlot];
  const activityMeta = ACTIVITIES.find((a) => a.id === activity);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable onPress={goBack} hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70">
          {step === 1 || step === 5
            ? <X size={20} color={TC.icon} strokeWidth={2} />
            : <ChevronLeft size={22} color={TC.icon} strokeWidth={2} />}
        </Pressable>
        {step < 5 ? <StepDots step={step} /> : <View />}
        <View className="w-9 h-9" />
      </View>

      <View className="px-5 pt-4 pb-1">
        <Text className="font-display text-xl text-foreground">{stepTitle}</Text>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── STEP 1: PICK A PLAN OR CREATE NEW ───────────────────────── */}
        {step === 1 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-4">
            {/* Create new — pinned to top */}
            <Pressable
              onPress={() => pickAnchor(null)}
              className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-4 flex-row items-center gap-3 active:opacity-80"
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: 'rgba(35,116,77,0.15)' }}>
                <Megaphone size={20} color={TC.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="font-display text-base text-foreground">Create a new plan</Text>
                <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                  Describe something fresh and see who's in.
                </Text>
              </View>
              <ChevronRight size={16} color={TC.primary} strokeWidth={2} />
            </Pressable>

            {/* Existing plans */}
            {anchorPlans.length > 0 && (
              <View>
                <FieldLabel>Or broadcast an existing plan</FieldLabel>
                <View className="gap-2">
                  {anchorPlans.map((p) => {
                    const d = p.date instanceof Date ? p.date : new Date(p.date);
                    const slotTime = p.timeSlot
                      ? TIME_SLOT_LABELS[p.timeSlot as TimeSlot]?.time
                      : null;
                    const loc = typeof p.location === 'string' ? p.location : p.location?.name;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => pickAnchor(p)}
                        className="bg-card rounded-2xl border border-border/30 px-4 py-3 flex-row items-center gap-3 shadow-sm active:opacity-80"
                      >
                        <View className="flex-1 gap-0.5">
                          <Text className="font-display text-sm text-foreground" numberOfLines={1}>
                            {p.title || 'Untitled plan'}
                          </Text>
                          <View className="flex-row items-center gap-3 flex-wrap">
                            <Text className="font-sans text-xs text-muted-foreground">
                              {format(d, 'EEE, MMM d')}{slotTime ? ` · ${slotTime}` : ''}
                            </Text>
                            {loc ? (
                              <View className="flex-row items-center gap-1 flex-shrink">
                                <MapPin size={10} color={TC.muted} strokeWidth={1.75} />
                                <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
                                  {loc}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <ChevronRight size={16} color={TINT.graySolid} strokeWidth={2} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {anchorPlans.length === 0 && (
              <Text className="font-sans text-xs text-muted-foreground px-1">
                No upcoming plans yet — create one above to broadcast it.
              </Text>
            )}
          </ScrollView>
        )}

        {/* ── STEP 2: DESCRIBE ────────────────────────────────────────── */}
        {step === 2 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-5" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View>
              <FieldLabel>Title</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Drinks Friday — who's in?"
                placeholderTextColor={TINT.graySolid}
                className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
                maxLength={100}
              />
            </View>

            <View>
              <FieldLabel>Activity</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                {ACTIVITIES.map((a) => {
                  const selected = activity === a.id;
                  return (
                    <Chip key={a.id} selected={selected} onPress={() => { Haptics.selectionAsync(); setActivity(a.id); }}>
                      <Text style={{ fontSize: 14 }}>{a.emoji}</Text>
                      <Text className={`font-sans text-xs font-medium ${selected ? 'text-white' : 'text-foreground'}`}>{a.label}</Text>
                    </Chip>
                  );
                })}
              </ScrollView>
            </View>

            <View>
              <FieldLabel>When</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                {dateOptions.map((d) => {
                  const selected = isSameDay(d, date);
                  return (
                    <Chip key={d.toISOString()} selected={selected} onPress={() => { Haptics.selectionAsync(); setDate(d); }}>
                      <View className="items-center">
                        <Text className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${selected ? 'text-white/80' : 'text-muted-foreground'}`}>
                          {dateLabel(d)}
                        </Text>
                        <Text className={`font-display text-base ${selected ? 'text-white' : 'text-foreground'}`}>
                          {format(d, 'MMM d')}
                        </Text>
                      </View>
                    </Chip>
                  );
                })}
              </ScrollView>
            </View>

            <View>
              <FieldLabel>Time</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {SLOTS.map(([id, meta]) => {
                  const selected = timeSlot === id;
                  return (
                    <Chip key={id} selected={selected} onPress={() => { Haptics.selectionAsync(); setTimeSlot(id); }}>
                      <View>
                        <Text className={`font-sans text-xs font-semibold ${selected ? 'text-white' : 'text-foreground'}`}>{meta.label}</Text>
                        <Text className={`font-sans text-[10px] ${selected ? 'text-white/70' : 'text-muted-foreground'}`}>{meta.time}</Text>
                      </View>
                    </Chip>
                  );
                })}
              </View>
            </View>

            <View>
              <FieldLabel>Where (optional)</FieldLabel>
              <LocationAutocomplete value={location} onChange={setLocation} placeholder="Bar, park, neighborhood…" types="establishment" />
            </View>

            <View>
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Who you're looking for, vibe, details…"
                placeholderTextColor={TINT.graySolid}
                className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                maxLength={500}
                multiline
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>
          </ScrollView>
        )}

        {/* ── STEP 3: AUDIENCE ────────────────────────────────────────── */}
        {step === 3 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-4" keyboardShouldPersistTaps="handled">
            {/* All friends */}
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setAudience({ type: 'all_friends' }); }}
              className={`rounded-2xl border px-4 py-3.5 flex-row items-center gap-3 ${audience.type === 'all_friends' ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
            >
              <UsersIcon size={18} color={TC.primary} strokeWidth={2} />
              <View className="flex-1">
                <Text className="font-sans text-sm font-semibold text-foreground">All friends</Text>
                <Text className="font-sans text-[11px] text-muted-foreground">{connectedFriends.length} people</Text>
              </View>
              {audience.type === 'all_friends' && <Check size={16} color={TC.primary} strokeWidth={2.5} />}
            </Pressable>

            {/* Pods */}
            {(pods ?? []).length > 0 && (
              <View>
                <FieldLabel>A pod</FieldLabel>
                <View className="gap-2">
                  {(pods ?? []).map((pod) => {
                    const selected = audience.type === 'pod' && audience.id === pod.id;
                    const memberCount = pod.memberIds.filter((id) =>
                      connectedFriends.some((f) => f.friendUserId === id),
                    ).length;
                    return (
                      <Pressable
                        key={pod.id}
                        onPress={() => { Haptics.selectionAsync(); setAudience({ type: 'pod', id: pod.id }); }}
                        className={`rounded-2xl border px-4 py-3 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
                      >
                        <Text style={{ fontSize: 16 }}>{pod.emoji ?? '💜'}</Text>
                        <View className="flex-1">
                          <Text className="font-sans text-sm font-semibold text-foreground">{pod.name}</Text>
                          <Text className="font-sans text-[11px] text-muted-foreground">{memberCount} people</Text>
                        </View>
                        {selected && <Check size={16} color={TC.primary} strokeWidth={2.5} />}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Interest tag */}
            <View>
              <FieldLabel>Friends with an interest</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {INTEREST_OPTIONS.map((tag) => {
                  const selected = audience.type === 'interest' && audience.tag === tag;
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => { Haptics.selectionAsync(); setAudience({ type: 'interest', tag }); }}
                      className={`rounded-full px-2.5 py-1 border active:opacity-70 ${selected ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
                    >
                      <Text className={`font-sans text-xs font-medium ${selected ? 'text-white' : 'text-foreground'}`}>{tag}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Specific friends */}
            {connectedFriends.length > 0 && (
              <View>
                <View className="flex-row items-center justify-between mb-2 px-0.5">
                  <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Specific friends
                  </Text>
                  {audience.type === 'friends' && audience.ids.length > 0 && (
                    <Text className="font-sans text-[11px] font-semibold text-primary">{audience.ids.length} selected</Text>
                  )}
                </View>
                <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                  {connectedFriends.map((f, i) => {
                    const checked = audience.type === 'friends' && audience.ids.includes(f.friendUserId!);
                    return (
                      <View key={f.id}>
                        <Pressable onPress={() => toggleAudienceFriend(f.friendUserId!)} className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30">
                          <Avatar url={f.avatar} displayName={f.name} size="sm" />
                          <Text className="flex-1 font-sans text-sm font-medium text-foreground" numberOfLines={1}>{f.name}</Text>
                          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? TC.primary : TINT.grayBorder, backgroundColor: checked ? TC.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                          </View>
                        </Pressable>
                        {i < connectedFriends.length - 1 && <View className="h-px bg-border/30 mx-4" />}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── STEP 4: PREVIEW ─────────────────────────────────────────── */}
        {step === 4 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-4">
            <Text className="font-sans text-xs text-muted-foreground px-1">
              Here's what your friends will see:
            </Text>

            {/* Recipient card */}
            <View className="bg-card rounded-2xl border border-border/30 shadow-sm p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <Megaphone size={14} color="#DFA53A" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-marigold">
                  Open invite
                </Text>
              </View>
              <Text className="font-sans text-sm text-foreground leading-relaxed">
                {myName ?? 'You'}, via Parade: <Text className="font-semibold">"{title.trim()}"</Text> — are you free?
              </Text>
              <View className="gap-1.5">
                <View className="flex-row items-center gap-2">
                  <CalendarCheck size={13} color={TC.muted} strokeWidth={2} />
                  <Text className="font-sans text-xs text-muted-foreground">
                    {format(date, 'EEEE, MMM d')} · {slotMeta.label} ({slotMeta.time})
                  </Text>
                </View>
                {location.trim() ? (
                  <View className="flex-row items-center gap-2">
                    <MapPin size={13} color={TC.muted} strokeWidth={2} />
                    <Text className="font-sans text-xs text-muted-foreground">{location.trim()}</Text>
                  </View>
                ) : null}
                {activityMeta && (
                  <View className="flex-row items-center gap-2">
                    <Sparkles size={13} color={TC.muted} strokeWidth={2} />
                    <Text className="font-sans text-xs text-muted-foreground">{activityMeta.emoji} {activityMeta.label}</Text>
                  </View>
                )}
                {notes.trim() ? (
                  <Text className="font-sans text-xs text-foreground/70 leading-relaxed mt-1">"{notes.trim()}"</Text>
                ) : null}
              </View>
            </View>

            {/* Audience + expiry */}
            <View className="bg-card rounded-2xl border border-border/30 shadow-sm px-4 py-3 gap-2">
              <View className="flex-row items-center gap-2">
                <UsersIcon size={13} color={TC.primary} strokeWidth={2} />
                <Text className="font-sans text-xs text-foreground">
                  Going to <Text className="font-semibold">{reach.label}</Text>
                  {reach.count !== null ? ` · ~${reach.count} ${reach.count === 1 ? 'person' : 'people'}` : ''}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Clock size={13} color={TC.muted} strokeWidth={2} />
                <Text className="font-sans text-xs text-muted-foreground">
                  Expires in 48 hours if nobody claims it.
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── STEP 5: SENT ────────────────────────────────────────────── */}
        {step === 5 && (
          <View className="flex-1 items-center justify-center px-8 gap-3">
            <Text style={{ fontSize: 44 }}>📣</Text>
            <Text className="font-display text-xl text-foreground text-center">Invite sent!</Text>
            <Text className="font-sans text-sm text-muted-foreground text-center leading-relaxed">
              {reach.label} will get a notification. First friend to claim it locks in the plan — we'll let you know.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="mt-3 bg-primary rounded-2xl px-8 py-3.5 active:opacity-80"
            >
              <Text className="font-sans text-sm font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        )}

        {/* ── Footer CTA (hidden on the chooser + sent screens) ───────── */}
        {step >= 2 && step < 5 && (
          <View className="px-5 pt-2 pb-4 border-t border-border/20">
            {step < 4 ? (
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setStep((s) => (s + 1) as any); }}
                disabled={step === 2 ? !canNext1 : !canNext2}
                className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${(step === 2 ? canNext1 : canNext2) ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
              >
                <Text className={`font-sans text-sm font-semibold ${(step === 2 ? canNext1 : canNext2) ? 'text-white' : 'text-muted-foreground'}`}>
                  {step === 2 ? 'Choose audience' : 'Preview'}
                </Text>
                <ChevronRight size={16} color={(step === 2 ? canNext1 : canNext2) ? '#FFFFFF' : TINT.graySolid} strokeWidth={2.5} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSend}
                disabled={createMut.isPending}
                className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${!createMut.isPending ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
              >
                {createMut.isPending
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : (
                    <>
                      <Megaphone size={16} color="#FFFFFF" strokeWidth={2.2} />
                      <Text className="font-sans text-sm font-semibold text-white">Send invite</Text>
                    </>
                  )}
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
