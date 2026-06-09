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
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  X, Check, ChevronLeft, ChevronRight, ChevronDown, UserPlus, Users as UsersIcon, Search,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { usePods } from '@/hooks/usePods';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { isSocialSlot, twoHourWindowLabel, SLOT_START_HOUR } from '@/lib/socialSlots';
import { resolveEffectiveCity, citiesMatch, normalizeCity } from '@/lib/effectiveCity';
import type { TimeSlot } from '@/types/planner';

const OVERLAP_DAYS = 182; // ~6 months
const SLOT_COLS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning', slot: 'early-morning' },
  { col: 'late_morning', slot: 'late-morning' },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon', slot: 'late-afternoon' },
  { col: 'evening', slot: 'evening' },
  { col: 'late-night' as any, slot: 'late-night' },
];
// note: late_night column name uses underscore
SLOT_COLS[5].col = 'late_night';

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
  const plans = usePlannerStore((s) => s.plans);
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const forceRefresh = usePlannerStore((s) => s.forceRefresh);
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
  // Strict co-located overlap over the next ~6 months: a slot only shows if
  // I'm free AND every selected friend is free AND we're all in the same city
  // that day. Fetched on demand when entering step 2.
  const selectedArr = useMemo(() => [...selectedFriendIds].sort(), [selectedFriendIds]);

  const { data: groupSlots = [], isLoading: overlapLoading } = useQuery({
    enabled: step === 2 && !!user?.id,
    queryKey: ['find-time-overlap', user?.id, selectedArr.join(','), homeAddress ?? ''],
    staleTime: 60_000,
    queryFn: async (): Promise<GroupSlot[]> => {
      const start = format(new Date(), 'yyyy-MM-dd');
      const end = format(addDays(new Date(), OVERLAP_DAYS), 'yyyy-MM-dd');
      const ids = [user!.id, ...selectedArr];

      const [{ data: avail }, { data: profs }, { data: trips }] = await Promise.all([
        (supabase as any)
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location')
          .in('user_id', ids)
          .gte('date', start)
          .lte('date', end),
        (supabase as any)
          .from('profiles')
          .select('user_id, home_address')
          .in('user_id', ids),
        // Trips carry the destination city for away days — availability rows
        // only flip slots busy and don't record where you are.
        (supabase as any)
          .from('trips')
          .select('user_id, location, start_date, end_date')
          .in('user_id', ids)
          .lte('start_date', end)
          .gte('end_date', start),
      ]);

      const rowByUserDate = new Map<string, any>();
      for (const r of (avail ?? [])) rowByUserDate.set(`${r.user_id}|${r.date}`, r);
      const homeByUser = new Map<string, string | null>();
      for (const p of (profs ?? [])) homeByUser.set(p.user_id, p.home_address ?? null);
      const tripsByUser = new Map<string, { start: string; end: string; location: string | null }[]>();
      for (const t of (trips ?? [])) {
        const arr = tripsByUser.get(t.user_id) ?? [];
        arr.push({ start: t.start_date, end: t.end_date, location: t.location });
        tripsByUser.set(t.user_id, arr);
      }
      const myHome = homeByUser.get(user!.id) ?? homeAddress ?? null;

      const tripFor = (uid: string, dateStr: string) =>
        (tripsByUser.get(uid) ?? []).find((t) => t.start <= dateStr && dateStr <= t.end) ?? null;

      // Effective city: a covering trip's destination wins; else availability
      // (away→trip_location) / home_address.
      const cityFor = (uid: string, dateStr: string): string => {
        const trip = tripFor(uid, dateStr);
        if (trip?.location) return normalizeCity(trip.location);
        const row = rowByUserDate.get(`${uid}|${dateStr}`);
        return resolveEffectiveCity({
          date: dateStr,
          availability: row
            ? { date: dateStr, location_status: row.location_status, trip_location: row.trip_location }
            : null,
          homeAddress: homeByUser.get(uid) ?? (uid === user!.id ? myHome : null),
        });
      };

      // Free: on a trip → available at the destination (the trip-busy flags
      // describe home, not the destination). Otherwise default-free unless an
      // explicit row marks the slot busy.
      const freeFor = (uid: string, dateStr: string, col: string): boolean => {
        if (tripFor(uid, dateStr)) return true;
        const row = rowByUserDate.get(`${uid}|${dateStr}`);
        return row ? !!row[col] : true;
      };

      const results: GroupSlot[] = [];
      for (let i = 0; i < OVERLAP_DAYS; i++) {
        const dateStr = format(addDays(new Date(), i), 'yyyy-MM-dd');
        const dObj = new Date(`${dateStr}T12:00:00`);

        if (selectedArr.length > 0) {
          const myCity = cityFor(user!.id, dateStr);
          if (!myCity) continue;
          const coLocated = selectedArr.every((fid) => {
            const fc = cityFor(fid, dateStr);
            return !!fc && citiesMatch(myCity, fc);
          });
          if (!coLocated) continue;
        }

        for (const { col, slot } of SLOT_COLS) {
          if (!isSocialSlot(dObj, slot)) continue;
          if (!freeFor(user!.id, dateStr, col)) continue;
          const allFree = selectedArr.every((fid) => freeFor(fid, dateStr, col));
          if (selectedArr.length > 0 && !allFree) continue;
          results.push({ date: dateStr, slot, freeFriendIds: [...selectedArr] });
        }
      }
      return results.slice(0, 30);
    },
  });

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

  // Group overlap slots into month → day → slots for the collapsible tree
  const grouped = useMemo(() => {
    const byMonth = new Map<string, Map<string, TimeSlot[]>>();
    for (const gs of groupSlots) {
      const mKey = gs.date.slice(0, 7); // yyyy-MM
      if (!byMonth.has(mKey)) byMonth.set(mKey, new Map());
      const days = byMonth.get(mKey)!;
      if (!days.has(gs.date)) days.set(gs.date, []);
      days.get(gs.date)!.push(gs.slot);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mKey, daysMap]) => {
        const days = [...daysMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, slots]) => ({
            date,
            slots: slots.sort((x, y) => SLOT_START_HOUR[x] - SLOT_START_HOUR[y]),
          }));
        return {
          key: mKey,
          label: format(new Date(`${mKey}-01T12:00:00`), 'MMMM yyyy'),
          days,
          dayCount: days.length,
        };
      });
  }, [groupSlots]);

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Auto-expand the soonest month + its first day whenever the result set
  // changes (e.g. different friends selected → fresh query).
  const initRef = useRef('');
  useEffect(() => {
    const sig = grouped.map((m) => m.key).join(',');
    if (grouped.length && initRef.current !== sig) {
      initRef.current = sig;
      setExpandedMonths(new Set([grouped[0].key]));
      setExpandedDays(new Set(grouped[0].days[0] ? [grouped[0].days[0].date] : []));
    }
  }, [grouped]);

  const toggleMonth = useCallback((key: string) => {
    Haptics.selectionAsync();
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleDay = useCallback((date: string) => {
    Haptics.selectionAsync();
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }, []);

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
              {selectedFriendIds.size > 0
                ? "Times in the next 6 months when you and everyone you picked are free and in the same city. Pick one — or several to let them vote."
                : 'Your open evenings & weekends. Pick one or more.'}
            </Text>

            {overlapLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#23744D" />
                <Text className="font-sans text-xs text-muted-foreground mt-3">Finding overlaps…</Text>
              </View>
            ) : groupSlots.length === 0 ? (
              /* No co-located overlap in 6 months → suggest a visit */
              <View className="bg-white rounded-2xl border border-dashed border-border/40 px-5 py-6 items-center gap-2 mt-2">
                <Text style={{ fontSize: 28 }}>🗺️</Text>
                <Text className="font-display text-base text-foreground text-center">
                  No overlapping free time in the same city
                </Text>
                <Text className="font-sans text-xs text-muted-foreground text-center leading-relaxed">
                  {selectedFriendIds.size > 0
                    ? "You and your friends aren't free in the same place over the next 6 months. Want to plan a visit instead?"
                    : 'No open social time in the next 6 months.'}
                </Text>
                {selectedFriendIds.size > 0 && (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.replace('/(app)/new-trip-proposal');
                    }}
                    className="mt-2 bg-primary rounded-2xl px-5 py-3 active:opacity-80"
                  >
                    <Text className="font-sans text-sm font-semibold text-white">Plan a visit</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              grouped.map((m) => {
                const mExpanded = expandedMonths.has(m.key);
                const mPicked = selectedSlots.filter((s) => s.date.startsWith(m.key)).length;
                return (
                  <View key={m.key} className="gap-1.5">
                    {/* Month tier */}
                    <Pressable
                      onPress={() => toggleMonth(m.key)}
                      className="flex-row items-center justify-between bg-white rounded-2xl border border-border/30 px-4 py-3 shadow-sm active:opacity-80"
                    >
                      <View className="flex-row items-center gap-2">
                        <ChevronDown size={16} color="#929298" strokeWidth={2} style={{ transform: [{ rotate: mExpanded ? '0deg' : '-90deg' }] }} />
                        <Text className="font-display text-base text-foreground">{m.label}</Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        {mPicked > 0 && (
                          <View className="bg-primary rounded-full px-2 py-0.5">
                            <Text className="font-sans text-[10px] font-semibold text-white">{mPicked} picked</Text>
                          </View>
                        )}
                        <Text className="font-sans text-xs text-muted-foreground">
                          {m.dayCount} {m.dayCount === 1 ? 'day' : 'days'}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Day tier */}
                    {mExpanded && m.days.map((day) => {
                      const dExpanded = expandedDays.has(day.date);
                      const dPicked = selectedSlots.filter((s) => s.date === day.date).length;
                      const dObj = new Date(`${day.date}T12:00:00`);
                      return (
                        <View key={day.date} className="ml-3 gap-1.5">
                          <Pressable
                            onPress={() => toggleDay(day.date)}
                            className="flex-row items-center justify-between bg-white rounded-xl border border-border/30 px-3.5 py-2.5 active:opacity-80"
                          >
                            <View className="flex-row items-center gap-2">
                              <ChevronDown size={14} color="#929298" strokeWidth={2} style={{ transform: [{ rotate: dExpanded ? '0deg' : '-90deg' }] }} />
                              <Text className="font-sans text-sm font-semibold text-foreground">{format(dObj, 'EEE, MMM d')}</Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                              {dPicked > 0 && <View className="w-2 h-2 rounded-full bg-primary" />}
                              <Text className="font-sans text-xs text-muted-foreground">
                                {day.slots.length} {day.slots.length === 1 ? 'time' : 'times'}
                              </Text>
                            </View>
                          </Pressable>

                          {/* Slot tier */}
                          {dExpanded && day.slots.map((slot) => {
                            const selected = selectedSlots.some((p) => p.date === day.date && p.slot === slot);
                            return (
                              <Pressable
                                key={slot}
                                onPress={() => toggleSlot({ date: day.date, slot })}
                                className={`ml-3 rounded-xl border px-3.5 py-2.5 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-white border-border/30'} active:opacity-80`}
                              >
                                <View className="flex-1">
                                  <Text className="font-display text-sm text-foreground">{twoHourWindowLabel(slot)}</Text>
                                  <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">{SLOT_LABEL[slot]}</Text>
                                </View>
                                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: selected ? '#23744D' : 'rgba(146,146,152,0.4)', backgroundColor: selected ? '#23744D' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                  {selected && <Check size={13} color="#FFFFFF" strokeWidth={2.5} />}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
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
