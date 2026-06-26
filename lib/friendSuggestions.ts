/**
 * Rank connected friends by how recently/frequently you've made plans with
 * them — used to suggest likely travel companions without an extra query
 * (derived from the planner store's already-loaded plans).
 */
import type { Plan, Friend } from '@/types/planner';

export function rankFriendsByPlanHistory(
  plans: Plan[],
  connectedFriends: Friend[],
  limit = 5,
): Friend[] {
  const score = new Map<string, { count: number; lastSeen: number }>();
  for (const p of plans) {
    const when = (p.date instanceof Date ? p.date : new Date(p.date)).getTime();
    for (const part of p.participants ?? []) {
      const id = part.friendUserId;
      if (!id) continue;
      const cur = score.get(id) ?? { count: 0, lastSeen: 0 };
      cur.count += 1;
      if (when > cur.lastSeen) cur.lastSeen = when;
      score.set(id, cur);
    }
  }

  const ranked = connectedFriends
    .filter((f) => f.friendUserId && score.has(f.friendUserId))
    .sort((a, b) => {
      const sa = score.get(a.friendUserId!)!;
      const sb = score.get(b.friendUserId!)!;
      if (sb.count !== sa.count) return sb.count - sa.count; // most plans together
      return sb.lastSeen - sa.lastSeen;                       // then most recent
    });

  // No shared plan history yet → fall back to a few connected friends so the
  // suggestion row is still a useful starting point.
  if (ranked.length === 0) return connectedFriends.slice(0, limit);
  return ranked.slice(0, limit);
}
