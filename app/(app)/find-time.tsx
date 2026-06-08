/**
 * "Find time with friends" — 3-step guided wizard (matches PWA GuidedPlanSheet).
 *
 *   Step 1  Who    — select connected friends + invite non-app guests by name
 *   Step 2  When   — group availability overlaps (slots ranked by how many
 *                    selected friends are also free), multi-select for voting
 *   Step 3  Details— title / activity / location / notes → send to participants
 *
 * Submit reuses plannerStore.addPlan (blocks availability + inserts
 * plan_participants), then inserts plan_proposal_options (if >1 slot picked)
 * and plan_invites placeholder rows for off-Parade guests.
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
import { router } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { format, addDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  X, Check, ChevronLeft, ChevronRight, UserPlus, Users as UsersIcon, Search,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { usePods } from '@/hooks/usePods';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { isSocialSlot, twoHourWindowLabel, SLOT_START_HOUR } from '@/lib/socialSlots';
import type { TimeSlot } from '@/types/planner';

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

const SLOT_LABEL: Record<TimeSlot, string> = {
  'early-morning': 'Early morning',
  'late-morning': 'Late morning',
  'early-afternoon': 'Early afternoon',
  'late-afternoon': 'Late afternoon',
  'evening': 'Evening',
  'late-night': 'Late night',
};

interface GroupSlot {
  date: string;       // yyyy-MM-dd
  slot: TimeSlot;
  freeFriendIds: string[];
}

const slotKey = (s: { date: string; slot: TimeSlot }) => `${s.date}|${s.slot}`;

// ─── Shared bits ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: i === step ? 18 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i === step ? '#23744D' : 'rgba(146,146,152,0.35)',
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

// ─── Main ──────────────────────────────────────────────────────────────────

export default function FindTimeScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const availability = usePlannerStore((s) => s.availability);
  const plans = usePlannerStore((s) => s.plans);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const forceRefresh = usePlannerStore((s) => s.forceRefresh);
  const { data: friendData } = useFriendDashboardData();
  const { data: pods } = usePods();

  const connectedFriends = useMemo(
    () => friends.filter((f) => f.status === 'connected' && f.friendUserId),
    [friends],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [query, setQuery] = useState('');

  // Step 2
  const [selectedSlots, setSelectedSlots] = useState<{ date: string; slot: TimeSlot }[]>([]);

  // Step 3
  const [title, setTitle] = useState('');
  const [activity, setActivity] = useState('drinks');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Group availability (step 2) ───────────────────────────────────────────
  const groupSlots = useMemo<GroupSlot[]>(() => {
    const weekDates = Array.from({ length: 14 }, (_, i) =>
      format(addDays(new Date(), i), 'yyyy-MM-dd'),
    );
    // My free social slots
    const mine: { date: string; slot: TimeSlot }[] = [];
    for (const day of availability) {
      const dateStr = format(day.date, 'yyyy-MM-dd');
      if (!weekDates.includes(dateStr)) continue;
      const dObj = new Date(`${dateStr}T12:00:00`);
      for (const [slot, free] of Object.entries(day.slots) as [TimeSlot, boolean][]) {
        if (free && isSocialSlot(dObj, slot)) mine.push({ date: dateStr, slot });
      }
    }
    // Per selected friend, set of their free (date|slot) keys (mutual+social w/ me)
    const friendFreeKeys = new Map<string, Set<string>>();
    for (const fid of selectedFriendIds) {
      const fv = friendData?.find((d) => d.userId === fid);
      const keys = new Set((fv?.overlapSlots ?? []).map(slotKey));
      friendFreeKeys.set(fid, keys);
    }
    const results = mine.map((m) => {
      const k = slotKey(m);
      const freeFriendIds = [...selectedFriendIds].filter((fid) =>
        friendFreeKeys.get(fid)?.has(k),
      );
      return { ...m, freeFriendIds };
    });
    // Rank: most friends free → soonest date → earliest slot
    results.sort(
      (a, b) =>
        b.freeFriendIds.length - a.freeFriendIds.length ||
        a.date.localeCompare(b.date) ||
        SLOT_START_HOUR[a.slot] - SLOT_START_HOUR[b.slot],
    );
    return results.slice(0, 14);
  }, [availability, selectedFriendIds, friendData]);

  const toggleFriend = useCallback((fid: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
  }, []);

  // How many plans the user shares with each friend (friendUserId → count)
  const planFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) {
      for (const part of p.participants ?? []) {
        if (part.friendUserId) {
          counts[part.friendUserId] = (counts[part.friendUserId] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [plans]);

  // Filter by search query, then sort by shared-plan frequency (most first)
  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? connectedFriends.filter((f) => f.name.toLowerCase().includes(q))
      : [...connectedFriends];
    return list.sort((a, b) => {
      const fa = planFrequency[a.friendUserId ?? ''] ?? 0;
      const fb = planFrequency[b.friendUserId ?? ''] ?? 0;
      return fb - fa || a.name.localeCompare(b.name);
    });
  }, [connectedFriends, query, planFrequency]);

  // Toggle a whole pod's members at once
  const togglePod = useCallback((podMemberIds: string[]) => {
    Haptics.selectionAsync();
    const members = podMemberIds.filter((id) =>
      connectedFriends.some((f) => f.friendUserId === id),
    );
    if (members.length === 0) return;
    setSelectedFriendIds((prev) => {
      const allSelected = members.every((id) => prev.has(id));
      const next = new Set(prev);
      members.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [connectedFriends]);

  const toggleSlot = useCallback((s: { date: string; slot: TimeSlot }) => {
    Haptics.selectionAsync();
    setSelectedSlots((prev) => {
      const k = slotKey(s);
      return prev.some((p) => slotKey(p) === k)
        ? prev.filter((p) => slotKey(p) !== k)
        : [...prev, s];
    });
  }, []);

  const addGuest = useCallback(() => {
    const name = guestDraft.trim();
    if (!name) return;
    Haptics.selectionAsync();
    setGuests((g) => [...g, name]);
    setGuestDraft('');
  }, [guestDraft]);

  const participantCount = selectedFriendIds.size + guests.length;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Add a plan name'); return; }
    if (selectedSlots.length === 0) { Alert.alert('Pick at least one time'); return; }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const primary = selectedSlots[0];
      const participants = connectedFriends
        .filter((f) => selectedFriendIds.has(f.friendUserId!))
        .map((f) => ({
          id: f.id, friendUserId: f.friendUserId, name: f.name,
          avatar: f.avatar, status: 'connected', role: 'participant',
        }));

      const hasParticipants = participants.length > 0 || guests.length > 0;
      const multiSlot = selectedSlots.length > 1;

      await addPlan({
        title: title.trim(),
        activity: activity as any,
        date: parseISO(primary.date),
        timeSlot: primary.slot,
        duration: 60,
        location: location.trim()
          ? { id: '', name: location.trim(), address: '' }
          : undefined,
        notes: notes.trim() || undefined,
        participants: participants as any,
        status: hasParticipants || multiSlot ? 'proposed' : 'confirmed',
        feedVisibility: 'private',
        blocksAvailability: true,
      } as any);

      // Fetch the just-created plan id (match recent created_at, same as new-plan)
      let planId: string | null = null;
      if (user?.id) {
        const { data } = await (supabase as any)
          .from('plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('time_slot', primary.slot)
          .gte('created_at', new Date(Date.now() - 30_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        planId = data?.id ?? null;
      }

      if (planId) {
        // Voting options when >1 slot chosen
        if (multiSlot) {
          const rows = selectedSlots.map((s, i) => ({
            plan_id: planId, date: s.date, time_slot: s.slot, sort_order: i,
          }));
          await (supabase as any).from('plan_proposal_options').insert(rows).then(
            () => {}, (e: any) => console.warn('proposal_options insert', e),
          );
        }
        // Off-Parade guest invites
        if (guests.length > 0 && user?.id) {
          const rows = guests.map((name) => ({
            plan_id: planId,
            invited_by: user.id,
            placeholder_name: name,
            invite_token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            status: 'pending',
          }));
          await (supabase as any).from('plan_invites').insert(rows).then(
            () => {}, (e: any) => console.warn('plan_invites insert', e),
          );
        }
      }

      await forceRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (planId) router.replace(`/(app)/plan/${planId}`);
      else router.back();
    } catch (err: any) {
      console.error('find-time submit failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create plan', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [title, activity, location, notes, selectedSlots, selectedFriendIds,
      guests, connectedFriends, addPlan, forceRefresh, user?.id]);

  // ── Header / nav ─────────────────────────────────────────────────────────
  const stepTitle = step === 1 ? 'Who are you planning with?'
    : step === 2 ? 'When works?'
    : 'Plan details';

  const canNext = step === 1 ? true : step === 2 ? selectedSlots.length > 0 : true;

  const goBack = () => (step === 1 ? router.back() : setStep((s) => (s - 1) as any));
  const goNext = () => setStep((s) => (s + 1) as any);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable onPress={goBack} hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70">
          {step === 1 ? <X size={20} color="#2F4F3F" strokeWidth={2} /> : <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />}
        </Pressable>
        <StepDots step={step} />
        <View className="w-9 h-9" />
      </View>

      <View className="px-5 pt-4 pb-1">
        <Text className="font-display text-xl text-foreground">{stepTitle}</Text>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── STEP 1: WHO ─────────────────────────────────────────────── */}
        {step === 1 && (
          <View className="flex-1">
            {/* ── Static top section (does not scroll) ─────────────────── */}
            <View className="px-5 pt-4 gap-4">
              {/* Invite someone new */}
              <View>
                <FieldLabel>Invite someone new</FieldLabel>
                <View className="flex-row gap-2">
                  <TextInput
                    value={guestDraft}
                    onChangeText={setGuestDraft}
                    placeholder="Name of someone not on Parade"
                    placeholderTextColor="#929298"
                    className="flex-1 bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                    onSubmitEditing={addGuest}
                    returnKeyType="done"
                  />
                  <Pressable onPress={addGuest} disabled={!guestDraft.trim()} className={`rounded-xl px-4 items-center justify-center ${guestDraft.trim() ? 'bg-primary' : 'bg-muted'}`}>
                    <UserPlus size={18} color={guestDraft.trim() ? '#FFFFFF' : '#929298'} strokeWidth={2} />
                  </Pressable>
                </View>
                {guests.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mt-2.5">
                    {guests.map((g, i) => (
                      <Pressable key={`${g}-${i}`} onPress={() => setGuests(guests.filter((_, idx) => idx !== i))} className="flex-row items-center gap-1.5 bg-marigold/10 rounded-full pl-3 pr-2 py-1.5 active:opacity-70">
                        <Text className="font-sans text-xs font-semibold text-marigold">{g}</Text>
                        <X size={12} color="#DFA53A" strokeWidth={2.5} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Pods — quick multi-select */}
              {(pods ?? []).length > 0 && (
                <View>
                  <FieldLabel>Pods</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                    {(pods ?? []).map((pod) => {
                      const members = pod.memberIds.filter((id) =>
                        connectedFriends.some((f) => f.friendUserId === id),
                      );
                      const active = members.length > 0 && members.every((id) => selectedFriendIds.has(id));
                      return (
                        <Pressable
                          key={pod.id}
                          onPress={() => togglePod(pod.memberIds)}
                          className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 border active:opacity-70 ${active ? 'bg-primary border-primary' : 'bg-white border-border/40'}`}
                        >
                          <Text style={{ fontSize: 13 }}>{pod.emoji ?? '💜'}</Text>
                          <Text className={`font-sans text-xs font-semibold ${active ? 'text-white' : 'text-foreground'}`}>{pod.name}</Text>
                          <Text className={`font-sans text-[10px] ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{members.length}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Friends header + search */}
              {connectedFriends.length > 0 && (
                <View>
                  <View className="flex-row items-center justify-between mb-2 px-0.5">
                    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Friends
                    </Text>
                    {selectedFriendIds.size > 0 && (
                      <Text className="font-sans text-[11px] font-semibold text-primary">{selectedFriendIds.size} selected</Text>
                    )}
                  </View>
                  <View className="flex-row items-center gap-2 bg-white rounded-xl border border-border/40 px-3 shadow-sm">
                    <Search size={16} color="#929298" strokeWidth={2} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search friends"
                      placeholderTextColor="#929298"
                      className="flex-1 py-2.5 font-sans text-sm text-foreground"
                      autoCorrect={false}
                    />
                    {query.length > 0 && (
                      <Pressable onPress={() => setQuery('')} hitSlop={6}>
                        <X size={14} color="#929298" strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* ── Scrollable friend grid (only this scrolls) ───────────── */}
            {connectedFriends.length > 0 ? (
              <ScrollView
                className="flex-1 mt-3"
                contentContainerClassName="px-5 pb-4"
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {filteredFriends.length === 0 ? (
                  <Text className="font-sans text-xs text-muted-foreground px-1">No friends match “{query}”.</Text>
                ) : (
                  <View className="flex-row flex-wrap" style={{ rowGap: 16, justifyContent: 'space-between' }}>
                    {filteredFriends.map((f) => {
                      const checked = selectedFriendIds.has(f.friendUserId!);
                      const firstName = f.name.split(' ')[0];
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => toggleFriend(f.friendUserId!)}
                          className="items-center active:opacity-70"
                          style={{ width: '31%' }}
                        >
                          <View
                            style={{
                              borderRadius: 999,
                              borderWidth: 2.5,
                              borderColor: checked ? '#23744D' : 'transparent',
                              padding: 2,
                            }}
                          >
                            <Avatar url={f.avatar} displayName={f.name} size="lg" />
                            {checked && (
                              <View
                                style={{
                                  position: 'absolute', bottom: 0, right: 0,
                                  width: 22, height: 22, borderRadius: 11,
                                  backgroundColor: '#23744D',
                                  borderWidth: 2, borderColor: '#F7F2EA',
                                  alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <Check size={12} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </View>
                          <Text className="font-sans text-xs text-foreground mt-1.5 text-center" numberOfLines={1}>
                            {firstName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            ) : (
              <Text className="font-sans text-xs text-muted-foreground px-6 pt-3">
                No friends yet — invite someone above, or continue solo to just block your own time.
              </Text>
            )}
          </View>
        )}

        {/* ── STEP 2: WHEN ────────────────────────────────────────────── */}
        {step === 2 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-2" keyboardShouldPersistTaps="handled">
            <Text className="font-sans text-xs text-muted-foreground px-1 pb-1">
              {participantCount > 0
                ? 'Times when you and your people are free. Pick one — or several to let them vote.'
                : 'Your open evenings & weekends. Pick one or more.'}
            </Text>
            {groupSlots.length === 0 ? (
              <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center">
                <Text className="font-sans text-sm text-muted-foreground">No open social time in the next 2 weeks</Text>
              </View>
            ) : (
              groupSlots.map((gs) => {
                const selected = selectedSlots.some((p) => slotKey(p) === slotKey(gs));
                const d = new Date(`${gs.date}T12:00:00`);
                return (
                  <Pressable
                    key={slotKey(gs)}
                    onPress={() => toggleSlot({ date: gs.date, slot: gs.slot })}
                    className={`rounded-2xl border px-4 py-3 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-white border-border/30'} shadow-sm active:opacity-80`}
                  >
                    <View className="flex-1">
                      <Text className="font-display text-base text-foreground">
                        {format(d, 'EEE, MMM d')} · {twoHourWindowLabel(gs.slot)}
                      </Text>
                      <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                        {SLOT_LABEL[gs.slot]}
                        {participantCount > 0 &&
                          ` · ${gs.freeFriendIds.length}/${selectedFriendIds.size} free`}
                      </Text>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected ? '#23744D' : 'rgba(146,146,152,0.4)', backgroundColor: selected ? '#23744D' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {selected && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── STEP 3: DETAILS ─────────────────────────────────────────── */}
        {step === 3 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-5" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View>
              <FieldLabel>What's the plan?</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Drinks at Sway Bar"
                placeholderTextColor="#929298"
                className="bg-white rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
                maxLength={100}
                autoFocus
              />
            </View>

            <View>
              <FieldLabel>Activity</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                {ACTIVITIES.map((a) => {
                  const selected = activity === a.id;
                  return (
                    <Pressable key={a.id} onPress={() => { Haptics.selectionAsync(); setActivity(a.id); }} className={`rounded-xl px-3 py-2.5 border flex-row items-center gap-1.5 active:opacity-70 ${selected ? 'bg-primary border-primary' : 'bg-white border-border/40'}`}>
                      <Text style={{ fontSize: 14 }}>{a.emoji}</Text>
                      <Text className={`font-sans text-xs font-medium ${selected ? 'text-white' : 'text-foreground'}`}>{a.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View>
              <FieldLabel>Where (optional)</FieldLabel>
              <LocationAutocomplete value={location} onChange={setLocation} placeholder="Bar, restaurant, neighborhood…" types="establishment" />
            </View>

            <View>
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Any extra details…"
                placeholderTextColor="#929298"
                className="bg-white rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
                maxLength={500}
                multiline
                style={{ minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>

            {/* Summary */}
            <View className="bg-white rounded-2xl border border-border/30 shadow-sm p-4 gap-2">
              <View className="flex-row items-center gap-2">
                <UsersIcon size={14} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-xs text-foreground">
                  {participantCount === 0 ? 'Just you' :
                    `${participantCount} ${participantCount === 1 ? 'person' : 'people'}`}
                  {guests.length > 0 ? ` · ${guests.length} guest${guests.length === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <Text className="font-sans text-xs text-muted-foreground">
                {selectedSlots.length === 1
                  ? `${format(new Date(`${selectedSlots[0].date}T12:00:00`), 'EEE, MMM d')} · ${twoHourWindowLabel(selectedSlots[0].slot)}`
                  : `${selectedSlots.length} time options — participants vote`}
              </Text>
            </View>
          </ScrollView>
        )}

        {/* ── Footer CTA ──────────────────────────────────────────────── */}
        <View className="px-5 pt-2 pb-4 border-t border-border/20">
          {step < 3 ? (
            <Pressable
              onPress={goNext}
              disabled={!canNext}
              className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${canNext ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
            >
              <Text className={`font-sans text-sm font-semibold ${canNext ? 'text-white' : 'text-muted-foreground'}`}>
                {step === 1 ? (participantCount > 0 ? 'See when everyone\'s free' : 'Continue solo') : 'Next'}
              </Text>
              <ChevronRight size={16} color={canNext ? '#FFFFFF' : '#929298'} strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={saving || !title.trim()}
              className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${!saving && title.trim() ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text className={`font-sans text-sm font-semibold ${title.trim() ? 'text-white' : 'text-muted-foreground'}`}>
                  {participantCount > 0 ? 'Send to participants' : 'Create plan'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
