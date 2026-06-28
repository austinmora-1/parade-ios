/**
 * Plan detail — read-only Phase 1.
 * Matches PWA plan-card style: left-border activity accent, Fraunces title,
 * detail rows (Date / Time / Location / People), notes section.
 *
 * Sections live in components/plan/: PlanChangeBanner, PlanDetailsCard,
 * ProposalVotingSection, RsvpSection, JoinRequestSection, photos, comments.
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
import { Pencil, Trash2, Share2 } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { PlanChangeBanner } from '@/components/plan/PlanChangeBanner';
import { PlanDetailsCard } from '@/components/plan/PlanDetailsCard';
import { ProposalVotingSection } from '@/components/plan/ProposalVotingSection';
import { RsvpSection } from '@/components/plan/RsvpSection';
import { JoinRequestSection } from '@/components/plan/JoinRequestSection';
import { PlanCommentsSection } from '@/components/plan/PlanCommentsSection';
import { UnifiedShareSheet } from '@/components/share/UnifiedShareSheet';
import { PlanCreatedConfetti } from '@/components/plan/PlanCreatedConfetti';
import { PlanPhotosSection } from '@/components/plan/PlanPhotosSection';
import { ReactionBar } from '@/components/primitives/ReactionBar';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { activityAccent } from '@/lib/activityColors';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { TC } from '@/lib/theme';
import { EMBER } from '@/lib/colors';

// ─── Data ─────────────────────────────────────────────────────────────────────

function usePlan(planId: string) {
  return useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      const [{ data: plan, error }, { data: participants }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', planId).single(),
        supabase
          .from('plan_participants')
          .select('id, friend_id, status, role, responded_at')
          .eq('plan_id', planId),
      ]);
      if (error) throw error;
      return { plan, participants: participants ?? [] };
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanDetailScreen() {
  const { planId, celebrate } = useLocalSearchParams<{ planId: string; celebrate?: string }>();
  const { user } = useAuth();
  const deletePlan = usePlannerStore((s) => s.deletePlan);

  const { data, isLoading, error, refetch } = usePlan(planId);
  const plan = data?.plan as any;
  const participants = (data?.participants ?? []) as any[];

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const accentColor = activityAccent(plan?.activity);
  const isOwner = plan?.user_id === user?.id;
  const myParticipant = participants.find((p) => p.friend_id === user?.id);

  // ── Header actions: edit / share / delete, inline (no menu) ───────────────
  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete plan?',
      'This will remove the plan for everyone invited. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deletePlan(planId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err) {
              console.error('Delete failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not delete plan', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [deletePlan, planId]);

  // Share modal mints a unique join link and offers Messages / WhatsApp /
  // Signal / copy
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title={plan?.title ?? 'Plan'}
        rightAction={
          isOwner || myParticipant ? (
            <View className="flex-row items-center">
              {/* Edit: owners edit directly; participants propose a change */}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push(
                    isOwner
                      ? `/(app)/new-plan?planId=${planId}`
                      : `/(app)/propose-change?planId=${planId}`,
                  );
                }}
                accessibilityLabel={isOwner ? 'Edit plan' : 'Propose change'}
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              >
                <Pencil size={20} color={TC.icon} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setShareOpen(true);
                }}
                accessibilityLabel="Share plan"
                className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              >
                <Share2 size={20} color={TC.icon} strokeWidth={2} />
              </Pressable>
              {isOwner && (
                <Pressable
                  onPress={handleDelete}
                  accessibilityLabel="Delete plan"
                  className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
                >
                  <Trash2 size={20} color={EMBER} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          ) : undefined
        }
      />

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : error || !plan ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {error ? 'Could not load this plan.' : 'Plan not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-4 pt-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* Hero card — white with activity left-border accent + Fraunces title */}
          <View className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: accentColor }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <Text className="font-display text-2xl text-foreground leading-tight">
                {plan.title || 'Untitled plan'}
              </Text>
              {plan.description ? (
                <Text className="font-sans text-sm text-foreground/70 leading-relaxed mt-1">
                  {plan.description}
                </Text>
              ) : null}
              <View className="mt-2">
                <ReactionBar target="plan" targetId={planId} />
              </View>
            </View>
          </View>

          <PlanChangeBanner planId={planId} currentUserId={user?.id} />

          <PlanDetailsCard plan={plan} participantCount={participants.length} />

          {/* Notes */}
          {plan.notes ? (
            <View className="bg-card rounded-2xl border border-border/30 p-5 gap-2 shadow-sm">
              <Text className="font-sans text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Notes
              </Text>
              <Text className="font-sans text-sm text-foreground leading-relaxed">
                {plan.notes}
              </Text>
            </View>
          ) : null}

          <ProposalVotingSection planId={planId} planStatus={plan.status} isOwner={isOwner} />

          <RsvpSection planId={planId} isOwner={isOwner} myParticipant={myParticipant} />

          <JoinRequestSection planId={planId} isOwner={isOwner} isParticipant={!!myParticipant} />

          {/* Owner sees a small "You proposed this plan" hint instead */}
          {isOwner && participants.length > 0 && (
            <View className="bg-primary/5 rounded-2xl px-4 py-3 border border-primary/15">
              <Text className="font-sans text-xs text-primary text-center">
                You proposed this plan · {participants.filter(p => p.status === 'accepted').length} of {participants.length} accepted
              </Text>
            </View>
          )}

          {/* ── Photos ────────────────────────────────────────────────── */}
          <PlanPhotosSection planId={planId} />

          {/* ── Comments ──────────────────────────────────────────────── */}
          <PlanCommentsSection planId={planId} />
        </ScrollView>
      )}

      {user && (
        <UnifiedShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          heading="Share plan"
          subheading={`Anyone with the link can ask to join${plan?.title ? ` “${plan.title}”` : ''}`}
          emailSubject={`Join my plan${plan?.title ? `: ${plan.title}` : ''}`}
          shareTitle={plan?.title || 'Parade plan'}
          resolve={async () => {
            const { data, error } = await supabase
              .from('plan_invites')
              .insert({ plan_id: planId, invited_by: user.id } as any)
              .select('invite_token')
              .single();
            if (error || !data) return null;
            return {
              link: `https://helloparade.app/invite.html?t=${(data as any).invite_token}`,
              message: `Join my plan "${plan?.title || 'on Parade'}"`,
            };
          }}
        />
      )}

      {/* One-shot celebration when arriving from find-time (XPE-243) */}
      <PlanCreatedConfetti active={celebrate === '1' && !!plan} />
    </SafeAreaView>
  );
}
