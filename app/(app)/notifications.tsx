/**
 * Notifications screen — Phase 3 Block 3 polish.
 *
 * Features:
 *   - Fraunces header + PWA-aligned card styling
 *   - Tap notification → marks read + deep links to relevant screen
 *   - "Mark all read" header action when any unread exist
 *   - Type-aware icon per notification (friend req / plan / generic)
 *   - Pull-to-refresh
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  Bell,
  UserPlus,
  CalendarCheck,
  Sparkles,
  CheckCheck,
} from 'lucide-react-native';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { TINT } from '@/lib/colors';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';

// ─── Notification routing ────────────────────────────────────────────────────

/**
 * Resolve where tapping this notification should navigate. Shared mapper
 * (lib/notificationRoutes) — url first, notification type as fallback, and
 * urls pointing back at this screen fall through to the type fallback.
 */
function notificationToRoute(notif: any): string | null {
  return resolveNotificationRoute({
    url: notif.url ?? notif.data?.url,
    type: notif.type,
    selfRoute: '/(app)/notifications',
  });
}

// ─── Type → icon ─────────────────────────────────────────────────────────────

function iconForType(type: string | undefined): React.ReactNode {
  const t = (type ?? '').toLowerCase();
  if (t.includes('friend')) {
    return <UserPlus size={16} color="#23744D" strokeWidth={2} />;
  }
  if (t.includes('plan') || t.includes('rsvp') || t.includes('invite')) {
    return <CalendarCheck size={16} color="#D46549" strokeWidth={2} />;
  }
  return <Sparkles size={16} color="#DFA53A" strokeWidth={2} />;
}

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useNotifications(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: notifs, isLoading, refetch } = useNotifications(user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => (notifs ?? []).filter((n) => !n.read).length,
    [notifs],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleTap = useCallback(
    async (notif: any) => {
      Haptics.selectionAsync();
      // Fire-and-forget mark-read (don't block the navigation)
      if (!notif.read) {
        (supabase as any)
          .from('notifications')
          .update({ read: true })
          .eq('id', notif.id)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
          });
      }
      const route = notificationToRoute(notif);
      if (route) router.push(route as any);
    },
    [queryClient],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!user?.id || unreadCount === 0) return;
    setMarkingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await (supabase as any)
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    } finally {
      setMarkingAll(false);
    }
  }, [user?.id, unreadCount, queryClient]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title="Notifications"
        rightAction={
          unreadCount > 0 ? (
            <Pressable
              onPress={handleMarkAllRead}
              disabled={markingAll}
              hitSlop={6}
              className="flex-row items-center gap-1 active:opacity-60"
            >
              {markingAll ? (
                <ActivityIndicator size="small" color="#23744D" />
              ) : (
                <>
                  <CheckCheck size={14} color="#23744D" strokeWidth={2.2} />
                  <Text className="font-sans text-xs font-semibold text-primary">
                    Mark all read
                  </Text>
                </>
              )}
            </Pressable>
          ) : undefined
        }
      />

      {isLoading && !refreshing ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : (
        <ScrollView
          contentContainerClassName="pb-10"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#23744D"
            />
          }
        >
          {!notifs || notifs.length === 0 ? (
            <View className="items-center justify-center py-20 px-8 gap-3">
              <Bell size={40} color="#929298" strokeWidth={1.5} />
              <Text className="font-sans text-sm text-muted-foreground text-center">
                No notifications yet.
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                Friend requests, plan invites, and reminders will show up here.
              </Text>
            </View>
          ) : (
            <View className="px-5 gap-2 pt-2">
              {notifs.map((n: any) => {
                const route = notificationToRoute(n);
                const tappable = route !== null;
                const isUnread = !n.read;

                return (
                  <Pressable
                    key={n.id}
                    onPress={() => handleTap(n)}
                    disabled={!tappable && n.read}
                    className={`bg-card rounded-2xl px-4 py-3.5 flex-row items-start gap-3 shadow-sm active:opacity-80 ${
                      isUnread ? 'border border-primary/30' : 'border border-border/20'
                    }`}
                  >
                    {/* Type icon in muted rounded square */}
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: isUnread
                          ? TINT.primarySubtle
                          : TINT.grayFaint,
                      }}
                    >
                      {iconForType(n.type)}
                    </View>

                    {/* Body */}
                    <View className="flex-1 gap-0.5">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className="font-sans font-semibold text-foreground text-sm flex-1"
                          numberOfLines={1}
                        >
                          {n.title ?? n.type ?? 'Notification'}
                        </Text>
                        {isUnread && (
                          <View className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </View>
                      {n.body ? (
                        <Text
                          className="font-sans text-xs text-muted-foreground leading-relaxed"
                          numberOfLines={2}
                        >
                          {n.body}
                        </Text>
                      ) : null}
                      <Text className="font-sans text-[11px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
