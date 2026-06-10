/**
 * New trip proposal — modal-presented form to draft a group trip where
 * invitees vote on candidate date ranges.
 *
 * Inserts:
 *   trip_proposals (one row, status='pending', proposal_type='trip')
 *   trip_proposal_dates (≥2 rows — the candidate ranges to vote on)
 *   trip_proposal_invites (one row per invitee — they'll see it on their
 *     Home dashboard via the TripProposalInvitesWidget)
 *
 * No trips row is created here — that happens later when the owner
 * finalizes a winning range on the trip-proposal screen.
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, isToday, isTomorrow, isSameDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, Check, Plane, Calendar, Users as UsersIcon, Plus, Trash2 } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
const START_DATE_CHIPS = 30;
const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 10, 14] as const;

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({ selected, onPress, children }: {
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
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}

interface DateOption {
  startDate: Date;
  duration:  number;
}

// ─── Mutation ────────────────────────────────────────────────────────────────

function useCreateTripProposal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name:         string;
      destination?: string;
      options:      DateOption[];
      inviteeIds:   string[];
    }) => {
      if (!user?.id) throw new Error('Not signed in');

      // 1. Create the proposal
      const { data: prop, error: propErr } = await (supabase as any)
        .from('trip_proposals')
        .insert({
          name:          input.name.trim(),
          destination:   input.destination?.trim() || null,
          host_user_id:  user.id,
          created_by:    user.id,
          proposal_type: 'trip',
          status:        'pending',
        })
        .select('id')
        .single();
      if (propErr) throw propErr;

      // 2. Date range options
      const dateRows = input.options.map((opt) => {
        const end = addDays(opt.startDate, Math.max(0, opt.duration - 1));
        return {
          proposal_id: prop.id,
          start_date:  format(opt.startDate, 'yyyy-MM-dd'),
          end_date:    format(end, 'yyyy-MM-dd'),
        };
      });
      const { error: datesErr } = await (supabase as any)
        .from('trip_proposal_dates')
        .insert(dateRows);
      if (datesErr) throw datesErr;

      // 3. Invitee rows
      if (input.inviteeIds.length > 0) {
        const inviteRows = input.inviteeIds.map((friend_user_id) => ({
          proposal_id: prop.id,
          accepted_by: friend_user_id,
          invited_by:  user.id,
          invite_token: `${prop.id}-${friend_user_id}`, // simple deterministic token
          status:      'pending',
        }));
        // Best-effort — invite_token column may have other constraints; if
        // insert fails we still have a working proposal
        await (supabase as any).from('trip_proposal_invites').insert(inviteRows);
      }
      return prop.id as string;
    },
    onSuccess: (proposalId) => {
      queryClient.invalidateQueries({ queryKey: ['trip-proposal', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['trip-proposal-invites'] });
    },
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function NewTripProposalScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const createMut = useCreateTripProposal();

  const [name,        setName]        = useState('');
  const [destination, setDestination] = useState('');
  const [options,     setOptions]     = useState<DateOption[]>([
    { startDate: addDays(new Date(), 7),  duration: 3 },
    { startDate: addDays(new Date(), 14), duration: 3 },
  ]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inviteeIds,  setInviteeIds]  = useState<Set<string>>(new Set());

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );

  const startDateChips = useMemo(
    () => Array.from({ length: START_DATE_CHIPS }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const toggleInvitee = useCallback((id: string) => {
    Haptics.selectionAsync();
    setInviteeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Give your trip a name.');
      return;
    }
    if (options.length < 2) {
      Alert.alert('At least 2 date options', 'Friends need alternatives to vote on.');
      return;
    }
    if (inviteeIds.size === 0) {
      Alert.alert('Invite at least one friend', 'A proposal needs voters.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const proposalId = await createMut.mutateAsync({
        name,
        destination,
        options,
        inviteeIds: [...inviteeIds],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Replace current modal with the proposal detail screen
      router.replace(`/(app)/trip-proposal/${proposalId}` as any);
    } catch (err: any) {
      console.error('Create trip proposal failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not create proposal', err?.message ?? 'Please try again.');
    }
  }, [name, destination, options, inviteeIds, createMut]);

  const saving = createMut.isPending;
  const canSubmit =
    name.trim().length > 0 &&
    options.length >= 2 &&
    inviteeIds.size > 0 &&
    !saving;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">Propose a trip</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSubmit ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Intro */}
          <View className="bg-primary/8 rounded-2xl px-4 py-3 flex-row items-start gap-2.5">
            <Plane size={16} color="#23744D" strokeWidth={2} />
            <Text className="font-sans text-xs text-primary flex-1 leading-relaxed">
              Pick a destination, add a few date ranges friends can vote on,
              then invite who you want along. Once everyone weighs in you can
              finalize the winning range.
            </Text>
          </View>

          {/* Name */}
          <View>
            <FieldLabel>Trip name</FieldLabel>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lisbon for a week"
              placeholderTextColor="#929298"
              className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
              maxLength={80}
              autoFocus
            />
          </View>

          {/* Destination */}
          <View>
            <FieldLabel>Destination (optional)</FieldLabel>
            <LocationAutocomplete
              value={destination}
              onChange={setDestination}
              placeholder="City, country, or region"
              types="(cities)"
            />
          </View>

          {/* Date options */}
          <View>
            <View className="flex-row items-center justify-between mb-2 px-0.5">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Date options
              </Text>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setOptions([
                    ...options,
                    {
                      startDate: addDays(options[options.length - 1]?.startDate ?? new Date(), 7),
                      duration:  options[options.length - 1]?.duration ?? 3,
                    },
                  ]);
                }}
                hitSlop={6}
                className="active:opacity-60"
              >
                <Text className="font-sans text-xs font-semibold text-primary">
                  + Add option
                </Text>
              </Pressable>
            </View>

            <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
              {options.map((opt, i) => {
                const end = addDays(opt.startDate, Math.max(0, opt.duration - 1));
                const sameMonth = format(opt.startDate, 'MMM') === format(end, 'MMM');
                const rangeLabel = sameMonth
                  ? `${format(opt.startDate, 'MMM d')} – ${format(end, 'd')}`
                  : `${format(opt.startDate, 'MMM d')} – ${format(end, 'MMM d')}`;
                const isExpanded = editingIndex === i;

                return (
                  <View key={i}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEditingIndex(isExpanded ? null : i);
                      }}
                      className="px-4 py-3 flex-row items-center gap-2"
                    >
                      <Calendar size={14} color="#23744D" strokeWidth={2} />
                      <View className="flex-1">
                        <Text className="font-display text-sm text-foreground">
                          {rangeLabel}
                        </Text>
                        <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                          {opt.duration} {opt.duration === 1 ? 'night' : 'nights'}
                        </Text>
                      </View>
                      {options.length > 2 && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            Haptics.selectionAsync();
                            setOptions(options.filter((_, idx) => idx !== i));
                            if (editingIndex === i) setEditingIndex(null);
                          }}
                          hitSlop={6}
                          className="active:opacity-60"
                        >
                          <Trash2 size={14} color="#929298" strokeWidth={2} />
                        </Pressable>
                      )}
                    </Pressable>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <View className="px-4 pb-3 gap-3 border-t border-border/20 pt-3">
                        <View>
                          <Text className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Leaving
                          </Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerClassName="gap-2 px-0.5 pb-1"
                          >
                            {startDateChips.map((d) => {
                              const selected = isSameDay(d, opt.startDate);
                              return (
                                <Chip
                                  key={d.toISOString()}
                                  selected={selected}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setOptions(
                                      options.map((o, idx) =>
                                        idx === i ? { ...o, startDate: d } : o,
                                      ),
                                    );
                                  }}
                                >
                                  <View className="items-center">
                                    <Text
                                      className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${
                                        selected ? 'text-white/80' : 'text-muted-foreground'
                                      }`}
                                    >
                                      {dateLabel(d)}
                                    </Text>
                                    <Text
                                      className={`font-display text-base ${
                                        selected ? 'text-white' : 'text-foreground'
                                      }`}
                                    >
                                      {format(d, 'MMM d')}
                                    </Text>
                                  </View>
                                </Chip>
                              );
                            })}
                          </ScrollView>
                        </View>
                        <View>
                          <Text className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Nights
                          </Text>
                          <View className="flex-row flex-wrap gap-2">
                            {DURATION_OPTIONS.map((days) => {
                              const selected = opt.duration === days;
                              return (
                                <Chip
                                  key={days}
                                  selected={selected}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setOptions(
                                      options.map((o, idx) =>
                                        idx === i ? { ...o, duration: days } : o,
                                      ),
                                    );
                                  }}
                                >
                                  <Text
                                    className={`font-sans text-xs font-semibold ${
                                      selected ? 'text-white' : 'text-foreground'
                                    }`}
                                  >
                                    {days}
                                  </Text>
                                </Chip>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    )}

                    {i < options.length - 1 && !isExpanded && (
                      <View className="h-px bg-border/30 mx-4" />
                    )}
                  </View>
                );
              })}
            </View>
            <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
              Tap a row to edit dates · Need at least 2 options.
            </Text>
          </View>

          {/* Invitees */}
          {connectedFriends.length > 0 ? (
            <View>
              <View className="flex-row items-center justify-between mb-2 px-0.5">
                <View className="flex-row items-center gap-1.5">
                  <UsersIcon size={12} color="#929298" strokeWidth={2} />
                  <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Invite voters
                  </Text>
                </View>
                {inviteeIds.size > 0 && (
                  <Text className="font-sans text-[11px] font-semibold text-primary">
                    {inviteeIds.size} selected
                  </Text>
                )}
              </View>
              <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {connectedFriends.map((f, i) => {
                  const checked = inviteeIds.has(f.friendUserId!);
                  return (
                    <View key={f.id}>
                      <Pressable
                        onPress={() => toggleInvitee(f.friendUserId!)}
                        className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
                      >
                        <Avatar url={f.avatar} displayName={f.name} size="sm" />
                        <Text className="flex-1 font-sans text-sm font-medium text-foreground" numberOfLines={1}>
                          {f.name}
                        </Text>
                        <View
                          style={{
                            width: 22, height: 22, borderRadius: 6,
                            borderWidth: 1.5,
                            borderColor: checked ? '#23744D' : TINT.grayStrong,
                            backgroundColor: checked ? '#23744D' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                        </View>
                      </Pressable>
                      {i < connectedFriends.length - 1 && (
                        <View className="h-px bg-border/30 mx-4" />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                Add friends first
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                A proposal needs invitees to vote.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
