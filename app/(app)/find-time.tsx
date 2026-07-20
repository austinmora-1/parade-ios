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
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { usePods } from '@/hooks/usePods';
import { supabase } from '@/integrations/supabase/client';
import { StepDots } from '@/components/find-time/StepDots';
import { WhoStep } from '@/components/find-time/WhoStep';
import { WhenStep } from '@/components/find-time/WhenStep';
import { DetailsStep } from '@/components/find-time/DetailsStep';
import { OVERLAP_DAYS, slotKey, groupSlotsByMonth, type GroupSlot } from '@/components/find-time/slots';
import { computeGroupSlots } from '@/components/find-time/slotOverlap';
import type { TimeSlot } from '@/types/planner';
import { TC } from '@/lib/theme';

export default function FindTimeScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans = usePlannerStore((s) => s.plans);
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const forceRefresh = usePlannerStore((s) => s.forceRefresh);
  const { data: pods } = usePods();

  // My social preference settings — rank/emphasize days & slots in step 2.
  const { data: socialPrefs } = useQuery({
    enabled: !!user?.id,
    queryKey: ['my-social-prefs', user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('preferred_social_days, preferred_social_times')
        .eq('user_id', user!.id)
        .maybeSingle();
      return {
        days: ((data as any)?.preferred_social_days as string[] | null) ?? [],
        times: new Set<string>(
          ((data as any)?.preferred_social_times as string[] | null) ?? [],
        ),
      };
    },
  });

  const connectedFriends = useMemo(
    () => friends.filter((f) => f.status === 'connected' && f.friendUserId),
    [friends],
  );

  // Optional pre-selected friend(s) by friendUserId — e.g. opened from an
  // iMessage "find time" bubble or a friend profile's "Plan with X" CTA.
  const { preFriend } = useLocalSearchParams<{ preFriend?: string }>();

  // With a friend pre-selected, land straight on the overlap step — the caller
  // already knows who; show them when (XPE-310). Back still reaches step 1.
  const [step, setStep] = useState<1 | 2 | 3>(preFriend ? 2 : 1);

  // Step 1
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    () => new Set(preFriend ? preFriend.split(',').filter(Boolean) : []),
  );
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
          .select('user_id, location, start_date, end_date, arrival_time, departure_time')
          .in('user_id', ids)
          .lte('start_date', end)
          .gte('end_date', start),
      ]);

      return computeGroupSlots({
        userId: user!.id,
        selectedArr,
        homeAddress: homeAddress ?? null,
        avail,
        profs,
        trips,
      });
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
  const grouped = useMemo(() => groupSlotsByMonth(groupSlots), [groupSlots]);

  // Everything starts collapsed — the user sees just the months at a glance.
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = useCallback((key: string) => {
    Haptics.selectionAsync();
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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
      // Land on the new plan's detail with a one-shot celebration (XPE-243).
      if (planId) router.replace(`/(app)/plan/${planId}?celebrate=1`);
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

  // Step 1 requires at least one Parade friend (no solo path here —
  // Quick plan covers solo logging).
  const canNext = step === 1 ? selectedFriendIds.size > 0 : step === 2 ? selectedSlots.length > 0 : true;

  const goBack = () => (step === 1 ? router.back() : setStep((s) => (s - 1) as any));
  const goNext = () => setStep((s) => (s + 1) as any);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable onPress={goBack} hitSlop={8} className="w-9 h-9 rounded-full items-center justify-center active:opacity-70">
          {step === 1 ? <X size={20} color={TC.icon} strokeWidth={2} /> : <ChevronLeft size={22} color={TC.icon} strokeWidth={2} />}
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
          <WhoStep
            guestDraft={guestDraft}
            onGuestDraftChange={setGuestDraft}
            onAddGuest={addGuest}
            guests={guests}
            onRemoveGuest={(i) => setGuests(guests.filter((_, idx) => idx !== i))}
            pods={pods ?? []}
            connectedFriends={connectedFriends}
            filteredFriends={filteredFriends}
            selectedFriendIds={selectedFriendIds}
            onTogglePod={togglePod}
            onToggleFriend={toggleFriend}
            query={query}
            onQueryChange={setQuery}
          />
        )}

        {/* ── STEP 2: WHEN ────────────────────────────────────────────── */}
        {step === 2 && (
          <WhenStep
            selectedFriendCount={selectedFriendIds.size}
            overlapLoading={overlapLoading}
            hasSlots={groupSlots.length > 0}
            grouped={grouped}
            expandedMonths={expandedMonths}
            selectedSlots={selectedSlots}
            onToggleMonth={toggleMonth}
            onToggleSlot={toggleSlot}
            preferredDays={socialPrefs?.days ?? []}
            preferredTimes={socialPrefs?.times ?? new Set()}
          />
        )}

        {/* ── STEP 3: DETAILS ─────────────────────────────────────────── */}
        {step === 3 && (
          <DetailsStep
            title={title}
            onTitleChange={setTitle}
            activity={activity}
            onActivityChange={setActivity}
            location={location}
            onLocationChange={setLocation}
            notes={notes}
            onNotesChange={setNotes}
            participantCount={participantCount}
            guestCount={guests.length}
            selectedSlots={selectedSlots}
          />
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
                {step === 1 ? "See when everyone's free" : 'Next'}
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
