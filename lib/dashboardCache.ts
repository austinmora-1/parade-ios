import { createMMKV } from 'react-native-mmkv';

const cache = createMMKV({ id: 'parade-dashboard-cache' });

export interface CachedDashboard {
  data: unknown;
  cachedAt: number;
}

const key = (userId: string) => `dashboard:${userId}`;

export async function getCachedDashboard(userId: string): Promise<CachedDashboard | null> {
  try {
    const raw = cache.getString(key(userId));
    return raw ? (JSON.parse(raw) as CachedDashboard) : null;
  } catch {
    return null;
  }
}

export async function setCachedDashboard(userId: string, data: unknown): Promise<void> {
  try {
    cache.set(key(userId), JSON.stringify({ data, cachedAt: Date.now() } satisfies CachedDashboard));
  } catch {
    // best-effort
  }
}

export async function patchCachedDashboard(
  userId: string,
  patcher: (data: any) => any
): Promise<void> {
  try {
    const cached = await getCachedDashboard(userId);
    if (!cached) return;
    const next = patcher(cached.data);
    if (!next) return;
    cache.set(key(userId), JSON.stringify({ data: next, cachedAt: cached.cachedAt } satisfies CachedDashboard));
  } catch {
    // best-effort
  }
}

export async function clearDashboardCache(): Promise<void> {
  try {
    cache.clearAll();
  } catch {
    // best-effort
  }
}
