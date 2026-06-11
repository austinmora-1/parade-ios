/**
 * Step 1 of the find-time wizard — pick friends/pods + invite off-app guests.
 * Presentational only; all state lives in app/(app)/find-time.tsx.
 */
import { ScrollView, View, Text, Pressable, TextInput } from 'react-native';
import { X, Check, UserPlus, Search } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { FieldLabel } from '@/components/find-time/FormBits';
import type { Friend } from '@/types/planner';
import type { Pod } from '@/hooks/usePods';

interface WhoStepProps {
  guestDraft: string;
  onGuestDraftChange: (text: string) => void;
  onAddGuest: () => void;
  guests: string[];
  onRemoveGuest: (index: number) => void;
  pods: Pod[];
  connectedFriends: Friend[];
  filteredFriends: Friend[];
  selectedFriendIds: Set<string>;
  onTogglePod: (memberIds: string[]) => void;
  onToggleFriend: (friendUserId: string) => void;
  query: string;
  onQueryChange: (text: string) => void;
}

export function WhoStep({
  guestDraft,
  onGuestDraftChange,
  onAddGuest,
  guests,
  onRemoveGuest,
  pods,
  connectedFriends,
  filteredFriends,
  selectedFriendIds,
  onTogglePod,
  onToggleFriend,
  query,
  onQueryChange,
}: WhoStepProps) {
  return (
    <View className="flex-1">
      {/* ── Static top section (does not scroll) ─────────────────── */}
      <View className="px-5 pt-4 gap-4">
        {/* Invite someone new */}
        <View>
          <FieldLabel>Invite someone new</FieldLabel>
          <View className="flex-row gap-2">
            <TextInput
              value={guestDraft}
              onChangeText={onGuestDraftChange}
              placeholder="Name of someone not on Parade"
              placeholderTextColor="#929298"
              className="flex-1 bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
              onSubmitEditing={onAddGuest}
              returnKeyType="done"
            />
            <Pressable onPress={onAddGuest} disabled={!guestDraft.trim()} className={`rounded-xl px-4 items-center justify-center ${guestDraft.trim() ? 'bg-primary' : 'bg-muted'}`}>
              <UserPlus size={18} color={guestDraft.trim() ? '#FFFFFF' : '#929298'} strokeWidth={2} />
            </Pressable>
          </View>
          {guests.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-2.5">
              {guests.map((g, i) => (
                <Pressable key={`${g}-${i}`} onPress={() => onRemoveGuest(i)} className="flex-row items-center gap-1.5 bg-marigold/10 rounded-full pl-3 pr-2 py-1.5 active:opacity-70">
                  <Text className="font-sans text-xs font-semibold text-marigold">{g}</Text>
                  <X size={12} color="#DFA53A" strokeWidth={2.5} />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Pods — quick multi-select */}
        {pods.length > 0 && (
          <View>
            <FieldLabel>Pods</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-0.5 pb-1">
              {pods.map((pod) => {
                const members = pod.memberIds.filter((id) =>
                  connectedFriends.some((f) => f.friendUserId === id),
                );
                const active = members.length > 0 && members.every((id) => selectedFriendIds.has(id));
                return (
                  <Pressable
                    key={pod.id}
                    onPress={() => onTogglePod(pod.memberIds)}
                    className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 border active:opacity-70 ${active ? 'bg-primary border-primary' : 'bg-card border-border/40'}`}
                  >
                    <Text style={{ fontSize: 13 }}>{pod.emoji ?? '💜'}</Text>
                    <Text className={`font-sans text-xs font-semibold ${active ? 'text-white' : 'text-foreground'}`}>{pod.name}</Text>
                    <Text className={`font-sans text-[10px] ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{members.length}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Friends header + search */}
        {connectedFriends.length > 0 && (
          <View>
            <View className="flex-row items-center justify-between mb-2 px-0.5">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Friends
              </Text>
              {selectedFriendIds.size > 0 && (
                <Text className="font-sans text-[11px] font-semibold text-primary">{selectedFriendIds.size} selected</Text>
              )}
            </View>
            <View className="flex-row items-center gap-2 bg-card rounded-xl border border-border/40 px-3 shadow-sm">
              <Search size={16} color="#929298" strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Search friends"
                placeholderTextColor="#929298"
                className="flex-1 py-2.5 font-sans text-sm text-foreground"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <Pressable onPress={() => onQueryChange('')} hitSlop={6}>
                  <X size={14} color="#929298" strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* ── Scrollable friend grid (only this scrolls) ───────────── */}
      {connectedFriends.length > 0 ? (
        <ScrollView
          className="flex-1 mt-3"
          contentContainerClassName="px-5 pb-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {filteredFriends.length === 0 ? (
            <Text className="font-sans text-xs text-muted-foreground px-1">No friends match “{query}”.</Text>
          ) : (
            <View className="flex-row flex-wrap" style={{ rowGap: 16, justifyContent: 'space-between' }}>
              {filteredFriends.map((f) => {
                const checked = selectedFriendIds.has(f.friendUserId!);
                const firstName = f.name.split(' ')[0];
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => onToggleFriend(f.friendUserId!)}
                    className="items-center active:opacity-70"
                    style={{ width: '31%' }}
                  >
                    <View
                      style={{
                        borderRadius: 999,
                        borderWidth: 2.5,
                        borderColor: checked ? '#23744D' : 'transparent',
                        padding: 2,
                      }}
                    >
                      <Avatar url={f.avatar} displayName={f.name} size="lg" />
                      {checked && (
                        <View
                          style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 22, height: 22, borderRadius: 11,
                            backgroundColor: '#23744D',
                            borderWidth: 2, borderColor: '#FBF9F4',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Check size={12} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text className="font-sans text-xs text-foreground mt-1.5 text-center" numberOfLines={1}>
                      {firstName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        <Text className="font-sans text-xs text-muted-foreground px-6 pt-3">
          No friends yet — invite someone above, or continue solo to just block your own time.
        </Text>
      )}
    </View>
  );
}
