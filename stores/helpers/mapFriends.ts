import { Friend } from '@/types/planner';
import { formatDisplayName } from '@/lib/formatName';

const STATUS_PRIORITY: Record<string, number> = { connected: 3, pending: 2, invited: 1 };

/** Map raw outgoing friendship rows + avatar map to Friend[] */
export const mapOutgoingFriendships = (
  rows: any[],
  avatarMap: Map<string, string | null>,
  profilesMap?: Map<string, any>,
): Friend[] =>
  rows.map(f => {
    const prof = f.friend_user_id ? profilesMap?.get(f.friend_user_id) : null;
    const name = prof
      ? formatDisplayName({ firstName: prof.first_name, lastName: prof.last_name, displayName: prof.display_name || f.friend_name })
      : f.friend_name;
    return {
      id: f.id,
      name,
      email: f.friend_email || undefined,
      avatar: f.friend_user_id ? (avatarMap.get(f.friend_user_id) || undefined) : undefined,
      friendUserId: f.friend_user_id || undefined,
      status: f.status as 'connected' | 'pending' | 'invited',
      isIncoming: false,
      isPodMember: f.is_pod_member || false,
    };
  });

/** Map raw incoming friendship rows + profile map to Friend[] */
export const mapIncomingFriendships = (
  rows: any[],
  profilesMap: Map<string, any>,
): Friend[] =>
  rows.map(f => {
    const prof = profilesMap.get(f.user_id);
    return {
      id: f.id,
      name: formatDisplayName({ firstName: prof?.first_name, lastName: prof?.last_name, displayName: prof?.display_name }) || 'Someone',
      avatar: prof?.avatar_url || undefined,
      friendUserId: f.user_id,
      status: f.status as 'connected' | 'pending' | 'invited',
      isIncoming: true,
    };
  });

/** Deduplicate outgoing friends by friendUserId (highest status wins) */
export const dedupeOutgoing = (list: Friend[]): Friend[] => {
  const byUserId = new Map<string, Friend>();
  const noUserId: Friend[] = [];
  for (const f of list) {
    if (!f.friendUserId) { noUserId.push(f); continue; }
    const existing = byUserId.get(f.friendUserId);
    if (!existing || (STATUS_PRIORITY[f.status] || 0) > (STATUS_PRIORITY[existing.status] || 0)) {
      byUserId.set(f.friendUserId, f);
    }
  }
  return [...byUserId.values(), ...noUserId.filter(f => {
    if (f.status !== 'invited' || !f.email) return true;
    return !byUserId.size;
  })];
};

/** Global dedup across outgoing + incoming friends (highest status wins, preserves direction) */
export const dedupeFriends = (outgoing: Friend[], incoming: Friend[]): Friend[] => {
  const dedupedOutgoing = dedupeOutgoing(outgoing);
  const globalByUserId = new Map<string, Friend>();
  const noUserId: Friend[] = [];

  for (const f of [...dedupedOutgoing, ...incoming]) {
    if (!f.friendUserId) { noUserId.push(f); continue; }
    const existing = globalByUserId.get(f.friendUserId);
    if (!existing || (STATUS_PRIORITY[f.status] || 0) > (STATUS_PRIORITY[existing.status] || 0)) {
      if (existing && !f.isIncoming && existing.isIncoming) {
        globalByUserId.set(f.friendUserId, { ...f });
      } else if (existing && f.isIncoming && !existing.isIncoming) {
        globalByUserId.set(f.friendUserId, { ...existing, status: f.status });
      } else {
        globalByUserId.set(f.friendUserId, f);
      }
    }
  }
  return [...globalByUserId.values(), ...noUserId];
};
