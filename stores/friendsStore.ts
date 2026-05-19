import { create } from 'zustand';
import { Friend } from '@/types/planner';
import { supabase } from '@/integrations/supabase/client';
import { mapOutgoingFriendships, mapIncomingFriendships, dedupeFriends } from './helpers/mapFriends';

export interface FriendsState {
  friends: Friend[];
}

export interface FriendsActions {
  _setFriends: (friends: Friend[]) => void;
  addFriend: (friend: Omit<Friend, 'id'>, userId: string) => Promise<void>;
  updateFriend: (id: string, updates: Partial<Friend>, userId: string) => Promise<void>;
  acceptFriendRequest: (friendshipId: string, requesterUserId: string, userId: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
  loadFriends: (userId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsState & FriendsActions>((set, get) => ({
  friends: [],

  _setFriends: (friends) => set({ friends }),

  addFriend: async (friend, userId) => {
    if (!userId) return;

    if (friend.friendUserId) {
      const { data: existing } = await supabase
        .from('friendships')
        .select('id, status')
        .eq('user_id', userId)
        .eq('friend_user_id', friend.friendUserId)
        .maybeSingle();
      if (existing) return;
    }

    const { data, error } = await supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_name: friend.name,
        friend_email: friend.email || null,
        friend_user_id: friend.friendUserId || null,
        status: friend.status,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding friend:', error);
      return;
    }

    if (friend.friendUserId && friend.status === 'pending') {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const projectId = process.env.EXPO_PUBLIC_SUPABASE_PROJECT_ID;
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', userId).single();
        const senderName = profile?.display_name || 'Someone';

        fetch(`https://${projectId}.supabase.co/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: friend.friendUserId,
            title: 'New Friend Request! 🎉',
            body: `${senderName} wants to connect with you`,
            url: '/notifications',
          }),
        }).catch(() => {});
      } catch (err) {
        console.error('Push notification error:', err);
      }
    }

    const newFriend: Friend = {
      id: data.id,
      name: data.friend_name,
      email: data.friend_email || undefined,
      friendUserId: data.friend_user_id || undefined,
      status: data.status as 'connected' | 'pending' | 'invited',
    };

    set((state) => ({ friends: [...state.friends, newFriend] }));
  },

  updateFriend: async (id, updates, userId) => {
    const friend = get().friends.find(f => f.id === id);
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name) dbUpdates.friend_name = updates.name;
    if (updates.email !== undefined) dbUpdates.friend_email = updates.email;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.isPodMember !== undefined) dbUpdates.is_pod_member = updates.isPodMember;

    let targetId = id;
    if (friend?.isIncoming && userId && friend.friendUserId) {
      const { data: existingRow } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_id', userId)
        .eq('friend_user_id', friend.friendUserId)
        .maybeSingle();

      if (existingRow) {
        targetId = existingRow.id;
      } else {
        const { data: newRow, error: insertError } = await supabase
          .from('friendships')
          .insert({
            user_id: userId,
            friend_user_id: friend.friendUserId,
            friend_name: friend.name,
            status: 'connected',
            is_pod_member: updates.isPodMember ?? false,
          })
          .select()
          .single();

        if (insertError || !newRow) {
          console.error('Error creating reciprocal friendship:', insertError);
          return;
        }

        set((state) => ({
          friends: state.friends.map((f) => f.id === id ? { ...f, ...updates, id: newRow.id, isIncoming: false } : f),
        }));
        return;
      }
    }

    const { error } = await supabase.from('friendships').update(dbUpdates as any).eq('id', targetId);
    if (error) {
      console.error('Error updating friend:', error);
      return;
    }

    set((state) => ({
      friends: state.friends.map((f) => f.id === id ? { ...f, ...updates } : f),
    }));
  },

  acceptFriendRequest: async (friendshipId, requesterUserId, userId) => {
    if (!userId) return;

    const { error } = await supabase.rpc('accept_friend_request', {
      p_friendship_id: friendshipId,
      p_requester_user_id: requesterUserId,
    });

    if (error) {
      console.error('Error accepting friend request:', error);
      return;
    }

    set((state) => ({
      friends: state.friends.map((f) =>
        f.id === friendshipId ? { ...f, status: 'connected' as const } : f
      ),
    }));
  },

  removeFriend: async (id) => {
    const { error } = await supabase.rpc('remove_friendship', { p_friendship_id: id });
    if (error) {
      console.error('Error removing friend:', error);
      return;
    }
    set((state) => ({ friends: state.friends.filter((f) => f.id !== id) }));
  },

  loadFriends: async (userId) => {
    if (!userId) return;

    const [outgoingResult, incomingResult] = await Promise.all([
      supabase.from('friendships').select('*').eq('user_id', userId),
      supabase.from('friendships_incoming' as any).select('*').eq('friend_user_id', userId),
    ]);

    const outgoingData = outgoingResult.data;
    const incomingData = incomingResult.data;

    const incomingUserIds = (incomingData || []).map((f: any) => f.user_id).filter(Boolean);
    const outgoingUserIds = (outgoingData || []).map((f: any) => f.friend_user_id).filter(Boolean) as string[];

    const [incomingProfilesResult, outgoingProfilesResult] = await Promise.all([
      incomingUserIds.length > 0
        ? supabase.rpc('get_display_names_for_users', { p_user_ids: incomingUserIds })
        : Promise.resolve({ data: [] as any[] }),
      outgoingUserIds.length > 0
        ? supabase.rpc('get_display_names_for_users', { p_user_ids: outgoingUserIds })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const incomingProfilesMap = new Map((incomingProfilesResult.data || []).map((p: any) => [p.user_id, p]));
    const outgoingProfilesMap = new Map((outgoingProfilesResult.data || []).map((p: any) => [p.user_id, p]));
    const outgoingAvatarMap = new Map<string, string | null>((outgoingProfilesResult.data || []).map((p: any) => [p.user_id, p.avatar_url]));

    const outgoingFriends = mapOutgoingFriendships(outgoingData || [], outgoingAvatarMap, outgoingProfilesMap);
    const incomingFriends = mapIncomingFriendships(incomingData || [], incomingProfilesMap);
    const friends = dedupeFriends(outgoingFriends, incomingFriends);

    set({ friends });
  },
}));
