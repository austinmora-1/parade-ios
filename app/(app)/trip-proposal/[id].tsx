/**
 * Trip Proposal detail — participants vote on candidate date ranges; owner
 * finalizes the winning range to spawn a real trip.
 *
 * URL: /(app)/trip-proposal/<id>
 *
 * Phase 8 Block 8 v1 — voting + finalize. Creation flow lands in a
 * follow-up; users who want to create proposals can use the PWA for now.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Plane, Check, MapPin } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import {
  useTripProposal,
  useVoteForTripDate,
  useFinalizeTripProposal,
} from '@/hooks/useTripProposal';

export default function TripProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: proposal, isLoading, refetch } = useTripProposal(id);
  const voteMut     = useVoteForTripDate();
  const finalizeMut = useFinalizeTripProposal();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const isOwner =
    proposal?.hostUserId === user?.id || proposal?.createdBy === user?.id;
  const isFinalized = proposal?.status === 'finalized';

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text
          className="font-display text-base text-foreground flex-1"
          numberOfLines={1}
        >
          {proposal?.name ?? 'Trip proposal'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : !proposal ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            Trip proposal not found.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-4 pt-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* Hero */}
          <View className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: '#23744D' }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <View className="flex-row items-center gap-1.5">
                <Plane size={14} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary">
                  Trip proposal
                </Text>
                {isFinalized && (
                  <View className="ml-auto bg-primary/10 rounded-full px-2 py-0.5">
                    <Text className="font-sans text-[10px] font-semibold text-primary">
                      Finalized
                    </Text>
                  </View>
                )}
              </View>
              <Text className="font-display text-2xl text-foreground leading-tight">
                {proposal.name || 'Untitled trip'}
              </Text>
              {proposal.destination && (
                <View className="flex-row items-center gap-1 mt-0.5">
                  <MapPin size={12} color="#929298" strokeWidth={1.75} />
                  <Text className="font-sans text-sm text-muted-foreground">
                    {proposal.destination}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Date voting */}
          {proposal.dates.length > 0 && !isFinalized && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Vote on dates
              </Text>
              <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {proposal.dates.map((d, i) => {
                  const start = parseISO(d.startDate);
                  const end   = parseISO(d.endDate);
                  const sameMonth = format(start, 'MMM') === format(end, 'MMM');
                  const range = sameMonth
                    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
                    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
                  const nights = Math.max(1, differenceInDays(end, start));
                  const isMyPick = d.myRank === 1;
                  const otherIds = proposal.dates
                    .filter((x) => x.id !== d.id)
                    .map((x) => x.id);

                  return (
                    <View key={d.id}>
                      <Pressable
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          try {
                            await voteMut.mutateAsync({
                              proposalId: proposal.id,
                              dateId:     d.id,
                              otherDateIds: otherIds,
                            });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } catch (err) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          }
                        }}
                        disabled={voteMut.isPending}
                        className={`px-4 py-3 flex-row items-center gap-3 ${
                          isMyPick ? 'bg-primary/8' : 'active:bg-muted/30'
                        }`}
                      >
                        <View
                          style={{
                            width: 22, height: 22, borderRadius: 999,
                            borderWidth: 2,
                            borderColor: isMyPick ? '#23744D' : 'rgba(146,146,152,0.4)',
                            backgroundColor: isMyPick ? '#23744D' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isMyPick && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                        <View className="flex-1">
                          <Text className="font-display text-sm text-foreground">
                            {range}
                          </Text>
                          <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                            {nights} {nights === 1 ? 'night' : 'nights'}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="font-display text-sm text-foreground">
                            {d.voteCount}
                          </Text>
                          <Text className="font-sans text-[10px] text-muted-foreground">
                            vote{d.voteCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                        {/* Owner finalize */}
                        {isOwner && (
                          <Pressable
                            onPress={async (e) => {
                              e.stopPropagation?.();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              try {
                                await finalizeMut.mutateAsync({
                                  proposalId:  proposal.id,
                                  hostUserId:  proposal.hostUserId ?? proposal.createdBy,
                                  name:        proposal.name,
                                  destination: proposal.destination,
                                  startDate:   d.startDate,
                                  endDate:     d.endDate,
                                });
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                router.back();
                              } catch (err: any) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                Alert.alert('Could not finalize', err?.message ?? 'Please try again.');
                              }
                            }}
                            hitSlop={4}
                            className="bg-primary/10 rounded-xl px-2 py-1 ml-1 active:opacity-70"
                          >
                            <Text className="font-sans text-[11px] font-semibold text-primary">
                              Pick this
                            </Text>
                          </Pressable>
                        )}
                      </Pressable>
                      {i < proposal.dates.length - 1 && (
                        <View className="h-px bg-border/30 mx-4" />
                      )}
                    </View>
                  );
                })}
              </View>
              <Text className="font-sans text-[11px] text-muted-foreground px-1">
                {isOwner
                  ? 'Tap "Pick this" once everyone has voted to create the trip.'
                  : 'Tap to vote for your top date.'}
              </Text>
            </View>
          )}

          {/* Finalized state */}
          {isFinalized && (
            <View className="bg-primary/8 rounded-2xl px-4 py-3 border border-primary/15">
              <Text className="font-sans text-xs text-primary text-center">
                This proposal has been finalized — find it in your trips.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
