/**
 * RsvpSection — "Your RSVP" block for non-owner participants: accepted /
 * declined states with an inline "change" link, or I'm in / Can't make it
 * buttons when the invite is still pending. Renders null for owners and
 * non-participants.
 */
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { usePlannerStore } from '@/stores/plannerStore';
import { TINT } from '@/lib/colors';

export function RsvpSection({
  planId,
  isOwner,
  myParticipant,
}: {
  planId: string;
  isOwner: boolean;
  myParticipant: { id: string; status?: string } | undefined;
}) {
  const queryClient = useQueryClient();
  const respondToProposal = usePlannerStore((s) => s.respondToProposal);
  const [rsvpLoading, setRsvpLoading] = useState<'accepted' | 'declined' | null>(null);

  const handleRsvp = useCallback(
    async (response: 'accepted' | 'declined') => {
      if (!myParticipant?.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRsvpLoading(response);
      try {
        await respondToProposal(planId, myParticipant.id, response);
        await queryClient.invalidateQueries({ queryKey: ['plan', planId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('RSVP failed', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not save RSVP', 'Please try again.');
      } finally {
        setRsvpLoading(null);
      }
    },
    [myParticipant?.id, planId, respondToProposal, queryClient],
  );

  if (isOwner || !myParticipant) return null;

  const myRsvp = myParticipant.status as 'invited' | 'accepted' | 'declined' | undefined;

  return (
    <View className="gap-2">
      <Text className="font-sans text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
        Your RSVP
      </Text>

      {myRsvp === 'accepted' && (
        <View
          className="flex-row items-center gap-2 rounded-2xl px-4 py-3.5 shadow-sm"
          style={{ backgroundColor: TINT.primarySubtle, borderWidth: 1, borderColor: TINT.primaryBorder }}
        >
          <Check size={18} color="#23744D" strokeWidth={2.5} />
          <Text className="flex-1 font-sans text-sm font-semibold text-primary">
            You're going
          </Text>
          <Pressable
            onPress={() => handleRsvp('declined')}
            disabled={rsvpLoading !== null}
            hitSlop={4}
          >
            <Text className="font-sans text-xs font-semibold text-muted-foreground underline">
              Change to no
            </Text>
          </Pressable>
        </View>
      )}

      {myRsvp === 'declined' && (
        <View
          className="flex-row items-center gap-2 rounded-2xl px-4 py-3.5 shadow-sm"
          style={{ backgroundColor: TINT.secondarySubtle, borderWidth: 1, borderColor: TINT.secondaryBorder }}
        >
          <X size={18} color="#D46549" strokeWidth={2.5} />
          <Text className="flex-1 font-sans text-sm font-semibold text-secondary">
            You declined
          </Text>
          <Pressable
            onPress={() => handleRsvp('accepted')}
            disabled={rsvpLoading !== null}
            hitSlop={4}
          >
            <Text className="font-sans text-xs font-semibold text-muted-foreground underline">
              Change to yes
            </Text>
          </Pressable>
        </View>
      )}

      {(!myRsvp || myRsvp === 'invited') && (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => handleRsvp('declined')}
            disabled={rsvpLoading !== null}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-card border border-border/40 rounded-2xl py-3.5 active:opacity-70 shadow-sm"
          >
            {rsvpLoading === 'declined' ? (
              <ActivityIndicator size="small" color="#D46549" />
            ) : (
              <>
                <X size={16} color="#D46549" strokeWidth={2.2} />
                <Text className="font-sans text-sm font-semibold text-secondary">
                  Can't make it
                </Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={() => handleRsvp('accepted')}
            disabled={rsvpLoading !== null}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-primary rounded-2xl py-3.5 active:opacity-80 shadow-sm"
          >
            {rsvpLoading === 'accepted' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text className="font-sans text-sm font-semibold text-white">
                  I'm in
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
