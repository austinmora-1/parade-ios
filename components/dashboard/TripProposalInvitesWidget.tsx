/**
 * TripProposalInvitesWidget — surfaces pending trip-proposal invitations
 * on the Home dashboard. Tap a card → trip-proposal/[id] to vote.
 *
 * Returns null when no pending invites.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Plane, ChevronRight, MapPin } from 'lucide-react-native';
import { useTripProposalInvites } from '@/hooks/useTripProposalInvites';

export function TripProposalInvitesWidget() {
  const { data: invites, isLoading } = useTripProposalInvites();
  if (isLoading || !invites || invites.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Plane size={12} color="#23744D" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Trips to vote on
        </Text>
        <View className="ml-auto bg-primary/10 rounded-full px-2 py-0.5">
          <Text className="font-sans text-xs text-primary font-semibold">
            {invites.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {invites.slice(0, 5).map((inv) => (
          <Pressable
            key={inv.inviteId}
            onPress={() => router.push(`/(app)/trip-proposal/${inv.proposalId}` as any)}
            className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
          >
            <View style={{ width: 4, backgroundColor: '#23744D' }} />
            <View className="flex-1 px-4 py-3 gap-1">
              <View className="flex-row items-center gap-1.5">
                <Plane size={11} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-[10px] font-semibold uppercase tracking-wider text-primary">
                  From {inv.hostName}
                </Text>
              </View>
              <Text
                className="font-display text-[17px] text-foreground"
                numberOfLines={1}
              >
                {inv.proposalName || 'Untitled trip'}
              </Text>
              <View className="flex-row items-center gap-3 mt-0.5">
                {inv.destination && (
                  <View className="flex-row items-center gap-1">
                    <MapPin size={11} color="#929298" strokeWidth={1.75} />
                    <Text
                      className="font-sans text-xs text-muted-foreground"
                      numberOfLines={1}
                    >
                      {inv.destination}
                    </Text>
                  </View>
                )}
                <Text className="font-sans text-xs text-muted-foreground">
                  {inv.dateCount} date {inv.dateCount === 1 ? 'option' : 'options'}
                </Text>
              </View>
            </View>
            <View className="items-center justify-center pr-3">
              <ChevronRight size={16} color="#929298" strokeWidth={2} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
