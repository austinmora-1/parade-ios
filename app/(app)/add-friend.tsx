/**
 * Add Friend modal — search profiles + send connection request,
 * or share an invite link to bring someone new to Parade.
 *
 * Reached via the "Invite" button on the Friends tab.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, UserPlus, Share2, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
interface ProfileMatch {
  user_id:      string;
  display_name: string | null;
  first_name:   string | null;
  last_name:    string | null;
  avatar_url:   string | null;
  /** Present once the upgraded search_profiles RPC is deployed. */
  relationship?: 'connected' | 'pending_outgoing' | 'pending_incoming' | 'none' | null;
  incoming_friendship_id?: string | null;
}

// ─── Search query (debounced) ────────────────────────────────────────────────

function useProfileSearch(query: string, currentUserId: string | undefined) {
  const trimmed = query.trim();
  return useQuery({
    enabled: trimmed.length >= 2 && !!currentUserId,
    queryKey: ['profile-search', trimmed],
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileMatch[]> => {
      // Match against display_name OR first_name (case-insensitive). Goes
      // through the search_profiles RPC: profiles RLS no longer exposes
      // non-friend rows, and the RPC returns only safe columns.
      const { data, error } = await (supabase as any)
        .rpc('search_profiles', { p_query: trimmed });
      if (error) throw error;
      return (data ?? []) as ProfileMatch[];
    },
  });
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export default function AddFriendScreen() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const addFriend = usePlannerStore((s) => s.addFriend);
  const acceptFriendRequest = usePlannerStore((s) => s.acceptFriendRequest);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data: results, isLoading, isFetching } = useProfileSearch(debounced, user?.id);

  // ── Helper: map of existing relationships keyed by friendUserId ───────────
  const friendStatusMap = useMemo(() => {
    const map = new Map<string, 'connected' | 'pending' | 'invited'>();
    friends.forEach((f) => {
      if (f.friendUserId) map.set(f.friendUserId, f.status as any);
    });
    return map;
  }, [friends]);

  // ── Send a friend request ─────────────────────────────────────────────────
  const sendRequest = async (profile: ProfileMatch) => {
    if (!user?.id) return;
    setSendingId(profile.user_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const displayName = formatDisplayName({
        firstName:   profile.first_name,
        lastName:    profile.last_name,
        displayName: profile.display_name,
      });
      await addFriend({
        name:         displayName || profile.display_name || 'Friend',
        friendUserId: profile.user_id,
        status:       'pending',
      });
      setRequestedIds((prev) => new Set(prev).add(profile.user_id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Friend request failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingId(null);
    }
  };

  // ── Accept an incoming friend request found via search ────────────────────
  const acceptRequest = async (profile: ProfileMatch) => {
    if (!user?.id || !profile.incoming_friendship_id) return;
    setAcceptingId(profile.user_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await acceptFriendRequest(profile.incoming_friendship_id, profile.user_id);
      setAcceptedIds((prev) => new Set(prev).add(profile.user_id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('Accept failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAcceptingId(null);
    }
  };

  // ── Native share fallback for non-Parade contacts ─────────────────────────
  const handleShareInvite = async () => {
    try {
      await Share.share({
        message:
          "Join me on Parade — let's hang out IRL more often. https://helloparade.app",
      });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">Add friends</Text>
        <View className="w-9" />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Search input ──────────────────────────────────────────────── */}
        <View className="px-5 pt-4 pb-3">
          <View className="flex-row items-center bg-card rounded-xl border border-border/30 px-3 gap-2 shadow-sm">
            <Search size={15} color="#929298" strokeWidth={1.75} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or @handle"
              placeholderTextColor="#929298"
              className="flex-1 font-sans text-sm text-foreground py-3"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              clearButtonMode="while-editing"
            />
            {isFetching && <ActivityIndicator size="small" color="#23744D" />}
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-10 gap-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Hint state (empty query) ──────────────────────────────────── */}
          {debounced.length < 2 && (
            <View className="px-5 items-center mt-8 gap-2">
              <Text style={{ fontSize: 36 }}>🔎</Text>
              <Text className="font-sans text-sm text-muted-foreground text-center">
                Search for friends already on Parade by their name or @handle.
              </Text>
            </View>
          )}

          {/* ── Loading skeleton ──────────────────────────────────────────── */}
          {isLoading && debounced.length >= 2 && (
            <View className="px-5 gap-2">
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  className="flex-row items-center bg-card rounded-xl px-3 py-2.5 border border-border/20 gap-3 shadow-sm"
                >
                  <Skeleton width={40} height={40} rounded="rounded-full" />
                  <View className="flex-1 gap-1.5">
                    <Skeleton width="50%" height={12} />
                    <Skeleton width="30%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── No results ────────────────────────────────────────────────── */}
          {!isLoading && debounced.length >= 2 && (results?.length ?? 0) === 0 && (
            <View className="px-5 items-center mt-6 gap-2">
              <Text className="font-sans text-sm text-muted-foreground text-center">
                No one matches "{debounced}".
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                Make sure you have the right handle, or invite them below.
              </Text>
            </View>
          )}

          {/* ── Results list ──────────────────────────────────────────────── */}
          {!isLoading && (results?.length ?? 0) > 0 && (
            <View className="px-5 gap-2">
              {results!.map((p) => {
                // Server-provided relationship (upgraded search_profiles RPC)
                // wins; fall back to deriving from the client store when the
                // RPC doesn't return it yet.
                const existing  = friendStatusMap.get(p.user_id);
                const rel       = p.relationship;
                const connected = acceptedIds.has(p.user_id)
                  || (rel ? rel === 'connected' : existing === 'connected');
                const incoming  = !connected
                  && rel === 'pending_incoming' && !!p.incoming_friendship_id;
                const requested = !connected && !incoming
                  && (requestedIds.has(p.user_id)
                    || (rel ? rel === 'pending_outgoing' : existing === 'pending'));
                const sending   = sendingId === p.user_id;
                const accepting = acceptingId === p.user_id;
                const displayName = formatDisplayName({
                  firstName:   p.first_name,
                  lastName:    p.last_name,
                  displayName: p.display_name,
                });

                return (
                  <View
                    key={p.user_id}
                    className="flex-row items-center bg-card rounded-xl px-3 py-2.5 border border-border/20 gap-3 shadow-sm"
                  >
                    <Avatar
                      url={p.avatar_url}
                      firstName={p.first_name}
                      lastName={p.last_name}
                      displayName={p.display_name}
                      size="md"
                    />
                    <View className="flex-1 min-w-0">
                      <Text
                        className="font-sans font-medium text-foreground text-sm"
                        numberOfLines={1}
                      >
                        {displayName || 'Unknown'}
                      </Text>
                      {p.display_name && (
                        <Text
                          className="font-sans text-xs text-muted-foreground"
                          numberOfLines={1}
                        >
                          @{p.display_name}
                        </Text>
                      )}
                    </View>

                    {/* Status / Action button */}
                    {connected ? (
                      <View
                        className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: TINT.primarySubtle }}
                      >
                        <Check size={12} color="#23744D" strokeWidth={2.5} />
                        <Text className="font-sans text-xs font-semibold text-primary">
                          Friends
                        </Text>
                      </View>
                    ) : incoming ? (
                      <Pressable
                        onPress={() => acceptRequest(p)}
                        disabled={accepting}
                        className="flex-row items-center gap-1 bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
                        hitSlop={4}
                      >
                        {accepting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Check size={12} color="#FFFFFF" strokeWidth={2.5} />
                            <Text className="font-sans text-xs font-semibold text-white">
                              Accept
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : requested ? (
                      <View className="px-2.5 py-1 rounded-full bg-muted">
                        <Text className="font-sans text-xs font-semibold text-muted-foreground">
                          Requested
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => sendRequest(p)}
                        disabled={sending}
                        className="flex-row items-center gap-1 bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
                        hitSlop={4}
                      >
                        {sending ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <UserPlus size={12} color="#FFFFFF" strokeWidth={2.2} />
                            <Text className="font-sans text-xs font-semibold text-white">
                              Add
                            </Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Share invite link card ────────────────────────────────────── */}
          <View className="px-5 mt-6">
            <View className="bg-card rounded-2xl border border-border/30 p-5 gap-3 shadow-sm">
              <View className="flex-row items-center gap-2">
                <Share2 size={16} color="#23744D" strokeWidth={2} />
                <Text className="font-display text-base text-foreground">
                  Not on Parade yet?
                </Text>
              </View>
              <Text className="font-sans text-xs text-muted-foreground leading-relaxed">
                Send them an invite link — they can sign up and you'll be
                connected automatically.
              </Text>
              <Pressable
                onPress={handleShareInvite}
                className="flex-row items-center justify-center gap-1.5 bg-primary/10 rounded-xl py-2.5 active:opacity-70 mt-1"
              >
                <Share2 size={14} color="#23744D" strokeWidth={2.2} />
                <Text className="font-sans text-sm font-semibold text-primary">
                  Share invite link
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
