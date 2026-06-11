/**
 * "Go somewhere" — trip/visit wizard (matches PWA GuidedTripSheet).
 *
 *   Step 1  Type     — plan a trip ✈️ vs visit with friends 🏠 (+ hosting /
 *            visiting mode for visits)
 *   Step 2  Friends  — avatar grid (coplan-frequency sorted) + search; for
 *            "visiting" pick whose city you're going to
 *   Step 3  Months   — next-6-months grid with free-weekend stats
 *   Step 4  Weekends — Fri–Sun candidates scored by group availability and
 *            trip conflicts, multi-select up to 5
 *   Step 5  Confirm  — name + destination + summary → share
 *
 * Submit:
 *   solo  → trips row + availability marked away (setTripAvailability)
 *   group → trip_proposals + trip_proposal_dates + trip_proposal_participants
 *           (creator 'voted', friends 'pending' — what the PWA reads) AND
 *           trip_proposal_invites rows (what the iOS incoming widget reads),
 *           then send-push-notification, then → the voting screen.
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
import { useQuery } from '@tanstack/react-query';
import {
  format, addDays, addMonths, startOfMonth, endOfMonth, parseISO,
} from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  X, Check, ChevronLeft, ChevronRight, Plane, Home as HomeIcon,
  Search, AlertTriangle, Users as UsersIcon,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { setTripAvailability } from '@/lib/tripBusy';
import { formatCityForDisplay } from '@/lib/formatCity';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

const MONTHS_AHEAD = 6;
const MAX_WEEKENDS = 5;
const SLOT_COLS = [
  'early_morning', 'late_morning', 'early_afternoon',
  'late_afternoon', 'evening', 'late_night',
] as const;

type TripType = 'trip' | 'visit';
type HostMode = 'hosting' | 'visiting';

interface WeekendOption {
  key: string;        // friday yyyy-MM-dd
  friday: Date;
  sunday: Date;
  monthKey: string;   // yyyy-MM (of the Friday)
  pct: number;        // group availability 0–100
  conflicts: number;  // participants with an overlapping trip
  score: number;
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
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

export default function GoSomewhereScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans = usePlannerStore((s) => s.plans);
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const forceRefresh = usePlannerStore((s) => s.forceRefresh);

  const connectedFriends = useMemo(
    () => friends.filter((f) => f.status === 'connected' && f.friendUserId),
    [friends],
  );

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1
  const [tripType, setTripType] = useState<TripType | null>(null);
  const [hostMode, setHostMode] = useState<HostMode>('visiting');

  // Step 2
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [hostFriendId, setHostFriendId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Step 3 + 4
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [selectedWeekendKeys, setSelectedWeekendKeys] = useState<Set<string>>(new Set());

  // Step 5
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedArr = useMemo(() => [...selectedFriendIds].sort(), [selectedFriendIds]);

  // ── Friend ranking (coplan frequency, like find-time) ────────────────────
  const planFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plans) {
      for (const part of p.participants ?? []) {
        if (part.friendUserId) counts[part.friendUserId] = (counts[part.friendUserId] ?? 0) + 1;
      }
    }
    return counts;
  }, [plans]);

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

  // ── Availability + trips + profiles for the 6-month window ───────────────
  const { data: windowData, isLoading: windowLoading } = useQuery({
    enabled: step >= 3 && !!user?.id,
    queryKey: ['go-somewhere-window', user?.id, selectedArr.join(',')],
    staleTime: 60_000,
    queryFn: async () => {
      const ids = [user!.id, ...selectedArr];
      const start = format(new Date(), 'yyyy-MM-dd');
      const end = format(endOfMonth(addMonths(new Date(), MONTHS_AHEAD - 1)), 'yyyy-MM-dd');
      const [{ data: avail }, { data: trips }, { data: profs }] = await Promise.all([
        (supabase as any)
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night')
          .in('user_id', ids)
          .gte('date', start)
          .lte('date', end),
        (supabase as any)
          .from('trips')
          .select('user_id, start_date, end_date')
          .in('user_id', ids)
          .lte('start_date', end)
          .gte('end_date', start),
        (supabase as any)
          .from('profiles')
          .select('user_id, home_address')
          .in('user_id', ids),
      ]);
      return { avail: avail ?? [], trips: trips ?? [], profs: profs ?? [] };
    },
  });

  // ── Weekend scoring (PWA parity: availability − trip conflicts) ──────────
  const weekends = useMemo<WeekendOption[]>(() => {
    if (!windowData) return [];
    const participants = [user?.id, ...selectedArr].filter(Boolean) as string[];
    const rowByUserDate = new Map<string, any>();
    for (const r of windowData.avail) rowByUserDate.set(`${r.user_id}|${r.date}`, r);
    const tripsByUser = new Map<string, { start: string; end: string }[]>();
    for (const t of windowData.trips) {
      const arr = tripsByUser.get(t.user_id) ?? [];
      arr.push({ start: t.start_date, end: t.end_date });
      tripsByUser.set(t.user_id, arr);
    }

    const results: WeekendOption[] = [];
    const endRange = endOfMonth(addMonths(new Date(), MONTHS_AHEAD - 1));
    // Walk every Friday from today forward
    let cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    while (cursor.getDay() !== 5) cursor = addDays(cursor, 1);
    while (cursor <= endRange) {
      const friday = new Date(cursor);
      const sunday = addDays(friday, 2);
      const dayStrs = [0, 1, 2].map((i) => format(addDays(friday, i), 'yyyy-MM-dd'));

      let freeSlots = 0;
      let conflicts = 0;
      for (const uid of participants) {
        const hasConflict = (tripsByUser.get(uid) ?? []).some(
          (t) => t.start <= dayStrs[2] && dayStrs[0] <= t.end,
        );
        if (hasConflict) conflicts += 1;
        for (const d of dayStrs) {
          const row = rowByUserDate.get(`${uid}|${d}`);
          if (!row) {
            freeSlots += SLOT_COLS.length; // default-free
          } else {
            for (const col of SLOT_COLS) if (row[col]) freeSlots += 1;
          }
        }
      }
      const denom = participants.length * 3 * SLOT_COLS.length;
      const pct = denom > 0 ? Math.round((freeSlots / denom) * 100) : 0;
      results.push({
        key: format(friday, 'yyyy-MM-dd'),
        friday,
        sunday,
        monthKey: format(friday, 'yyyy-MM'),
        pct,
        conflicts,
        score: pct - conflicts * 1000,
      });
      cursor = addDays(cursor, 7);
    }
    return results;
  }, [windowData, user?.id, selectedArr]);

  // ── Month grid stats ──────────────────────────────────────────────────────
  const months = useMemo(() => {
    return Array.from({ length: MONTHS_AHEAD }, (_, i) => {
      const m = addMonths(startOfMonth(new Date()), i);
      const key = format(m, 'yyyy-MM');
      const monthWeekends = weekends.filter((w) => w.monthKey === key);
      const good = monthWeekends.filter((w) => w.pct >= 66 && w.conflicts === 0).length;
      const conflicted = monthWeekends.filter((w) => w.conflicts > 0).length;
      return {
        key,
        label: format(m, 'MMMM'),
        year: format(m, 'yyyy'),
        total: monthWeekends.length,
        good,
        conflicted,
      };
    }).filter((m) => m.total > 0);
  }, [weekends]);

  // Weekend candidates in the selected months, best score first
  const weekendCandidates = useMemo(() => {
    return weekends
      .filter((w) => selectedMonths.has(w.monthKey))
      .sort((a, b) => b.score - a.score || a.friday.getTime() - b.friday.getTime());
  }, [weekends, selectedMonths]);

  const selectedWeekends = useMemo(
    () =>
      weekends
        .filter((w) => selectedWeekendKeys.has(w.key))
        .sort((a, b) => a.friday.getTime() - b.friday.getTime()),
    [weekends, selectedWeekendKeys],
  );

  // ── Toggles ───────────────────────────────────────────────────────────────
  const toggleFriend = useCallback((fid: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      next.has(fid) ? next.delete(fid) : next.add(fid);
      return next;
    });
    setHostFriendId((prev) => (prev === fid ? null : prev));
  }, []);

  const toggleMonth = useCallback((key: string) => {
    Haptics.selectionAsync();
    setSelectedMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleWeekend = useCallback((key: string) => {
    Haptics.selectionAsync();
    setSelectedWeekendKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_WEEKENDS) next.add(key);
      return next;
    });
  }, []);

  // Prefill destination when entering confirm (visiting → host's city,
  // hosting → my city). User edits stick.
  const enterConfirm = useCallback(() => {
    if (!destinationTouched) {
      let prefill = '';
      if (tripType === 'visit' && hostMode === 'visiting' && hostFriendId) {
        const hostHome = (windowData?.profs ?? []).find(
          (p: any) => p.user_id === hostFriendId,
        )?.home_address;
        prefill = hostHome ? (formatCityForDisplay(hostHome) || hostHome) : '';
      } else if (tripType === 'visit' && hostMode === 'hosting' && homeAddress) {
        prefill = formatCityForDisplay(homeAddress) || homeAddress;
      }
      if (prefill) setDestination(prefill);
    }
    setStep(5);
  }, [destinationTouched, tripType, hostMode, hostFriendId, windowData, homeAddress]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!user?.id || selectedWeekends.length === 0) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const isSolo = tripType === 'trip' && selectedArr.length === 0;

      if (isSolo) {
        // Solo trip: confirmed trips row spanning first→last weekend + away
        const first = selectedWeekends[0];
        const last = selectedWeekends[selectedWeekends.length - 1];
        const name =
          tripName.trim() ||
          (destination.trim() ? `Trip to ${destination.trim()}` : 'Weekend away');
        const { data: trip, error } = await (supabase as any)
          .from('trips')
          .insert({
            user_id: user.id,
            name,
            location: destination.trim() || null,
            start_date: format(first.friday, 'yyyy-MM-dd'),
            end_date: format(last.sunday, 'yyyy-MM-dd'),
            needs_return_date: false,
          })
          .select('id')
          .single();
        if (error) throw error;
        await setTripAvailability(setAvailability, first.friday, last.sunday, false);
        await forceRefresh();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(trip?.id ? `/(app)/trip/${trip.id}` : '/(app)/(tabs)');
        return;
      }

      // Group proposal — PWA contract
      const hostUserId =
        tripType === 'visit'
          ? hostMode === 'hosting' ? user.id : hostFriendId
          : null;
      const { data: proposal, error: propErr } = await (supabase as any)
        .from('trip_proposals')
        .insert({
          created_by: user.id,
          destination: destination.trim() || null,
          name: tripName.trim() || null,
          status: 'pending',
          proposal_type: tripType === 'visit' ? 'visit' : 'trip',
          host_user_id: hostUserId,
        })
        .select('id')
        .single();
      if (propErr || !proposal) throw propErr ?? new Error('No proposal created');

      const dateRows = selectedWeekends.map((w) => ({
        proposal_id: proposal.id,
        start_date: format(w.friday, 'yyyy-MM-dd'),
        end_date: format(w.sunday, 'yyyy-MM-dd'),
      }));
      const { error: datesErr } = await (supabase as any)
        .from('trip_proposal_dates')
        .insert(dateRows);
      if (datesErr) throw datesErr;

      // Participants — what the PWA reads (creator voted, friends pending)
      const participantRows = [user.id, ...selectedArr].map((uid) => ({
        proposal_id: proposal.id,
        user_id: uid,
        status: uid === user.id ? 'voted' : 'pending',
      }));
      await (supabase as any)
        .from('trip_proposal_participants')
        .insert(participantRows)
        .then(() => {}, (e: any) => console.warn('participants insert', e));

      // Invites — what the iOS incoming widget reads
      const inviteRows = selectedArr.map((fid) => ({
        proposal_id: proposal.id,
        accepted_by: fid,
        invited_by: user.id,
        invite_token: `${proposal.id}-${fid}`,
        status: 'pending',
      }));
      await (supabase as any)
        .from('trip_proposal_invites')
        .insert(inviteRows)
        .then(() => {}, (e: any) => console.warn('invites insert', e));

      // Push notification (fire-and-forget, same fn as PWA)
      const isVisit = tripType === 'visit';
      supabase.functions.invoke('send-push-notification', {
        body: {
          user_ids: selectedArr,
          title: isVisit ? '🏠 Visit Proposal' : '✈️ Trip Proposal',
          body: isVisit
            ? hostMode === 'hosting'
              ? `Vote on dates for a visit to ${destination.trim() || 'their city'}!`
              : `A visit to ${destination.trim() || 'your city'} is brewing — vote on dates!`
            : `Trip options${destination.trim() ? ` to ${destination.trim()}` : ''} — vote on dates!`,
          url: '/trips',
        },
      }).catch(() => {});

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/(app)/trip-proposal/${proposal.id}`);
    } catch (err: any) {
      console.error('go-somewhere submit failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create', err?.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [user?.id, tripType, hostMode, hostFriendId, selectedArr, selectedWeekends,
      tripName, destination, setAvailability, forceRefresh]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const stepTitle =
    step === 1 ? 'Where to?'
    : step === 2 ? tripType === 'visit' ? 'Who are you seeing?' : "Who's coming?"
    : step === 3 ? 'Which months?'
    : step === 4 ? 'Pick weekends'
    : 'Almost there';

  const isSoloEligible = tripType === 'trip';
  const canNext =
    step === 1 ? tripType !== null
    : step === 2 ? (isSoloEligible || selectedFriendIds.size > 0) &&
        !(tripType === 'visit' && hostMode === 'visiting' && selectedFriendIds.size > 0 && !hostFriendId)
    : step === 3 ? selectedMonths.size > 0
    : step === 4 ? selectedWeekendKeys.size > 0
    : true;

  const goBack = () => (step === 1 ? router.back() : setStep((s) => (s - 1) as any));
  const goNext = () => {
    Haptics.selectionAsync();
    if (step === 4) enterConfirm();
    else setStep((s) => (s + 1) as any);
  };

  const selectedFriendNames = connectedFriends
    .filter((f) => selectedFriendIds.has(f.friendUserId!))
    .map((f) => f.name.split(' ')[0]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable onPress={goBack} hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70">
          {step === 1
            ? <X size={20} color={TC.icon} strokeWidth={2} />
            : <ChevronLeft size={22} color={TC.icon} strokeWidth={2} />}
        </Pressable>
        <StepDots step={step} total={5} />
        <View className="w-9 h-9" />
      </View>

      <View className="px-5 pt-4 pb-1">
        <Text className="font-display text-xl text-foreground">{stepTitle}</Text>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── STEP 1: TYPE ────────────────────────────────────────────── */}
        {step === 1 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-3">
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setTripType('trip'); }}
              className={`rounded-2xl border px-4 py-4 flex-row items-center gap-3 ${tripType === 'trip' ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: 'rgba(35,116,77,0.12)' }}>
                <Plane size={20} color={TC.primary} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="font-display text-base text-foreground">Plan a trip</Text>
                <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                  Solo or with friends — find weekends that work and go.
                </Text>
              </View>
              {tripType === 'trip' && <Check size={18} color={TC.primary} strokeWidth={2.5} />}
            </Pressable>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); setTripType('visit'); }}
              className={`rounded-2xl border px-4 py-4 flex-row items-center gap-3 ${tripType === 'visit' ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
            >
              <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: 'rgba(223,165,58,0.15)' }}>
                <HomeIcon size={20} color="#DFA53A" strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="font-display text-base text-foreground">Visit with friends</Text>
                <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                  Host friends in your city, or go see them in theirs.
                </Text>
              </View>
              {tripType === 'visit' && <Check size={18} color={TC.primary} strokeWidth={2.5} />}
            </Pressable>

            {tripType === 'visit' && (
              <View className="mt-1">
                <FieldLabel>Which way?</FieldLabel>
                <View className="flex-row gap-2">
                  {([['visiting', "I'm visiting them"], ['hosting', "I'm hosting"]] as const).map(([mode, label]) => (
                    <Pressable
                      key={mode}
                      onPress={() => { Haptics.selectionAsync(); setHostMode(mode); }}
                      className={`flex-1 rounded-xl border px-3 py-3 items-center ${hostMode === mode ? 'bg-primary border-primary' : 'bg-card border-border/40'} active:opacity-70`}
                    >
                      <Text className={`font-sans text-xs font-semibold ${hostMode === mode ? 'text-white' : 'text-foreground'}`}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── STEP 2: FRIENDS ─────────────────────────────────────────── */}
        {step === 2 && (
          <View className="flex-1">
            <View className="px-5 pt-3 gap-3">
              {/* Search */}
              <View className="flex-row items-center gap-2 bg-card rounded-xl border border-border/40 px-3 shadow-sm">
                <Search size={16} color={TINT.graySolid} strokeWidth={2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search friends"
                  placeholderTextColor={TINT.graySolid}
                  className="flex-1 py-2.5 font-sans text-sm text-foreground"
                  autoCorrect={false}
                />
                {query.length > 0 && (
                  <Pressable onPress={() => setQuery('')} hitSlop={6}>
                    <X size={14} color={TINT.graySolid} strokeWidth={2} />
                  </Pressable>
                )}
              </View>

              {/* Whose city? (visiting mode) */}
              {tripType === 'visit' && hostMode === 'visiting' && selectedFriendIds.size > 0 && (
                <View>
                  <FieldLabel>Whose city are you visiting?</FieldLabel>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
                    {connectedFriends
                      .filter((f) => selectedFriendIds.has(f.friendUserId!))
                      .map((f) => {
                        const active = hostFriendId === f.friendUserId;
                        return (
                          <Pressable
                            key={f.id}
                            onPress={() => { Haptics.selectionAsync(); setHostFriendId(f.friendUserId!); }}
                            className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 border active:opacity-70 ${active ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
                          >
                            <Text className={`font-sans text-xs font-semibold ${active ? 'text-white' : 'text-foreground'}`}>
                              {f.name.split(' ')[0]}'s city
                            </Text>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Friend grid */}
            <ScrollView className="flex-1 mt-3" contentContainerClassName="px-5 pb-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {filteredFriends.length === 0 ? (
                <Text className="font-sans text-xs text-muted-foreground px-1">No friends match "{query}".</Text>
              ) : (
                <View className="flex-row flex-wrap" style={{ rowGap: 16, justifyContent: 'space-between' }}>
                  {filteredFriends.map((f) => {
                    const checked = selectedFriendIds.has(f.friendUserId!);
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => toggleFriend(f.friendUserId!)}
                        className="items-center active:opacity-70"
                        style={{ width: '31%' }}
                      >
                        <View style={{ borderRadius: 999, borderWidth: 2.5, borderColor: checked ? TC.primary : 'transparent', padding: 2 }}>
                          <Avatar url={f.avatar} displayName={f.name} size="lg" />
                          {checked && (
                            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: TC.primary, borderWidth: 2, borderColor: '#FBF9F4', alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={12} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          )}
                        </View>
                        <Text className="font-sans text-xs text-foreground mt-1.5 text-center" numberOfLines={1}>
                          {f.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* ── STEP 3: MONTHS ──────────────────────────────────────────── */}
        {step === 3 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4">
            {windowLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={TC.primary} />
                <Text className="font-sans text-xs text-muted-foreground mt-3">Checking everyone's calendars…</Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap" style={{ rowGap: 10, justifyContent: 'space-between' }}>
                {months.map((m) => {
                  const selected = selectedMonths.has(m.key);
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => toggleMonth(m.key)}
                      className={`rounded-2xl border px-4 py-3.5 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
                      style={{ width: '48.5%' }}
                    >
                      <Text className="font-display text-base text-foreground">{m.label}</Text>
                      <Text className="font-sans text-[10px] text-muted-foreground">{m.year}</Text>
                      <Text className={`font-sans text-[11px] font-semibold mt-1.5 ${m.good > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {m.good}/{m.total} weekends look good
                      </Text>
                      {m.conflicted > 0 && (
                        <View className="flex-row items-center gap-1 mt-0.5">
                          <AlertTriangle size={10} color="#DFA53A" strokeWidth={2} />
                          <Text className="font-sans text-[10px] text-marigold">
                            {m.conflicted} with trips
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* ── STEP 4: WEEKENDS ────────────────────────────────────────── */}
        {step === 4 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-2">
            <Text className="font-sans text-xs text-muted-foreground px-1 pb-1">
              Ranked by when {selectedArr.length > 0 ? 'everyone is' : "you're"} most free. Pick up to {MAX_WEEKENDS} — friends vote on the final one.
            </Text>
            {weekendCandidates.map((w) => {
              const selected = selectedWeekendKeys.has(w.key);
              return (
                <Pressable
                  key={w.key}
                  onPress={() => toggleWeekend(w.key)}
                  className={`rounded-2xl border px-4 py-3 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} shadow-sm active:opacity-80`}
                >
                  <View className="flex-1">
                    <Text className="font-sans text-sm font-semibold text-foreground">
                      {format(w.friday, 'MMM d')}–{format(w.sunday, 'd')} · {format(w.friday, 'EEE')}–{format(w.sunday, 'EEE')}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className={`font-sans text-[11px] font-semibold ${w.pct >= 66 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {w.pct}% free
                      </Text>
                      {w.conflicts > 0 && (
                        <View className="flex-row items-center gap-1">
                          <AlertTriangle size={10} color="#DFA53A" strokeWidth={2} />
                          <Text className="font-sans text-[10px] text-marigold">
                            {w.conflicts} {w.conflicts === 1 ? 'person has' : 'people have'} a trip
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected ? TC.primary : TINT.grayBorder, backgroundColor: selected ? TC.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {selected && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* ── STEP 5: CONFIRM ─────────────────────────────────────────── */}
        {step === 5 && (
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-5" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View>
              <FieldLabel>Trip name (optional)</FieldLabel>
              <TextInput
                value={tripName}
                onChangeText={setTripName}
                placeholder={tripType === 'visit' ? 'e.g. Boston reunion' : 'e.g. Catskills getaway'}
                placeholderTextColor={TINT.graySolid}
                className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
                maxLength={80}
              />
            </View>

            <View>
              <FieldLabel>Destination</FieldLabel>
              <LocationAutocomplete
                value={destination}
                onChange={(v) => { setDestination(v); setDestinationTouched(true); }}
                placeholder="City"
                types="(cities)"
              />
            </View>

            {/* Summary */}
            <View className="bg-card rounded-2xl border border-border/30 shadow-sm p-4 gap-2.5">
              <View className="flex-row items-center gap-2">
                {tripType === 'visit'
                  ? <HomeIcon size={14} color="#DFA53A" strokeWidth={2} />
                  : <Plane size={14} color={TC.primary} strokeWidth={2} />}
                <Text className="font-sans text-xs font-semibold text-foreground">
                  {tripType === 'visit'
                    ? hostMode === 'hosting' ? 'Hosting friends' : 'Visiting friends'
                    : selectedArr.length > 0 ? 'Group trip' : 'Solo trip'}
                </Text>
              </View>
              {selectedFriendNames.length > 0 && (
                <View className="flex-row items-center gap-2">
                  <UsersIcon size={13} color={TC.muted} strokeWidth={2} />
                  <Text className="font-sans text-xs text-muted-foreground" numberOfLines={2}>
                    {selectedFriendNames.join(', ')}
                  </Text>
                </View>
              )}
              <View className="gap-1">
                {selectedWeekends.map((w) => (
                  <Text key={w.key} className="font-sans text-xs text-muted-foreground">
                    • {format(w.friday, 'EEE, MMM d')} – {format(w.sunday, 'EEE, MMM d')}
                    {'  '}
                    <Text className={w.pct >= 66 ? 'text-primary font-semibold' : ''}>{w.pct}% free</Text>
                  </Text>
                ))}
              </View>
              {selectedArr.length > 0 && (
                <Text className="font-sans text-[11px] text-muted-foreground/80">
                  Friends get a notification and vote on the dates that work.
                </Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* ── Footer CTA ──────────────────────────────────────────────── */}
        <View className="px-5 pt-2 pb-4 border-t border-border/20">
          {step < 5 ? (
            <Pressable
              onPress={goNext}
              disabled={!canNext}
              className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${canNext ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
            >
              <Text className={`font-sans text-sm font-semibold ${canNext ? 'text-white' : 'text-muted-foreground'}`}>
                {step === 2 && selectedFriendIds.size === 0 && isSoloEligible ? 'Continue solo' : 'Next'}
              </Text>
              <ChevronRight size={16} color={canNext ? '#FFFFFF' : TINT.graySolid} strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={sending}
              className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 ${!sending ? 'bg-primary active:opacity-80' : 'bg-muted'}`}
            >
              {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text className="font-sans text-sm font-semibold text-white">
                  {selectedArr.length > 0 ? 'Share with friends' : 'Book it'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
