/**
 * FriendSearchSelect — search-driven friend picker with removable selected
 * chips and a "Suggested" shortlist (e.g. recent / frequently-seen friends)
 * shown when the search box is empty. Used for trip travel companions.
 */
import { View, Text, Pressable, TextInput } from 'react-native';
import { useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Search, X } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { ELEPHANT } from '@/lib/colors';
import type { Friend } from '@/types/planner';

export function FriendSearchSelect({
  title,
  hint,
  connectedFriends,
  selectedIds,
  suggestedFriends = [],
  onToggle,
  maxResults = 8,
}: {
  title: string;
  hint?: string;
  connectedFriends: Friend[];
  selectedIds: Set<string>;
  /** Ordered shortlist shown when the search box is empty. */
  suggestedFriends?: Friend[];
  onToggle: (friendUserId: string) => void;
  maxResults?: number;
}) {
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () =>
      [...selectedIds]
        .map((id) => connectedFriends.find((f) => f.friendUserId === id))
        .filter(Boolean) as Friend[],
    [selectedIds, connectedFriends],
  );

  const trimmed = query.trim().toLowerCase();

  // Searching → matching friends; empty → suggested shortlist. Both exclude
  // already-selected friends.
  const results = useMemo(() => {
    const pool = trimmed
      ? connectedFriends.filter((f) => f.name.toLowerCase().includes(trimmed))
      : suggestedFriends;
    return pool.filter((f) => f.friendUserId && !selectedIds.has(f.friendUserId)).slice(0, maxResults);
  }, [trimmed, connectedFriends, suggestedFriends, selectedIds, maxResults]);

  if (connectedFriends.length === 0) return null;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 px-0.5">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </Text>
        {selectedIds.size > 0 && (
          <Text className="font-sans text-[11px] font-semibold text-primary">
            {selectedIds.size} selected
          </Text>
        )}
      </View>

      {/* Selected chips */}
      {selected.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mb-2">
          {selected.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => { Haptics.selectionAsync(); onToggle(f.friendUserId!); }}
              className="flex-row items-center gap-1.5 rounded-full bg-primary/10 pl-1 pr-2 py-1 active:opacity-70"
            >
              <Avatar url={f.avatar} displayName={f.name} size="xs" />
              <Text className="font-sans text-xs font-medium text-foreground" numberOfLines={1}>
                {f.name}
              </Text>
              <X size={12} color={ELEPHANT} strokeWidth={2.25} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Search box */}
      <View className="flex-row items-center gap-2 rounded-xl border border-border/40 bg-card px-3 shadow-sm">
        <Search size={15} color={ELEPHANT} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends…"
          placeholderTextColor="#929298"
          className="flex-1 py-3 font-sans text-sm text-foreground"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} className="active:opacity-60">
            <X size={15} color={ELEPHANT} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {/* Results / suggestions */}
      {results.length > 0 ? (
        <View className="mt-2">
          {!trimmed && (
            <Text className="font-sans text-[11px] text-muted-foreground mb-1.5 px-0.5">
              Suggested
            </Text>
          )}
          <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
            {results.map((f, i) => (
              <View key={f.id}>
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); onToggle(f.friendUserId!); setQuery(''); }}
                  className="flex-row items-center px-4 py-2.5 gap-3 active:bg-muted/30"
                >
                  <Avatar url={f.avatar} displayName={f.name} size="sm" />
                  <Text
                    className="flex-1 font-sans text-sm font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {f.name}
                  </Text>
                </Pressable>
                {i < results.length - 1 && <View className="h-px bg-border/30 mx-4" />}
              </View>
            ))}
          </View>
        </View>
      ) : trimmed ? (
        <Text className="font-sans text-xs text-muted-foreground mt-2 px-0.5">
          No friends match “{query.trim()}”.
        </Text>
      ) : null}

      {hint && selected.length === 0 && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
          {hint}
        </Text>
      )}
    </View>
  );
}
