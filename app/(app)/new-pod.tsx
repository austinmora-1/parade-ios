/**
 * New / edit pod — modal-presented form.
 *
 * Reached from:
 *   - Friends tab Pods section "+ New pod" → no podId → create
 *   - Pod detail screen → with ?podId=xxx → edit
 *
 * Fields: emoji picker (12 options), name (required), member multi-select.
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { X, Check } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import {
  usePod,
  useCreatePod,
  useUpdatePod,
  useDeletePod,
  POD_EMOJIS,
} from '@/hooks/usePods';
import { Avatar } from '@/components/primitives/Avatar';
import { TC } from '@/lib/theme';

import { TINT } from '@/lib/colors';
function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

export default function NewPodScreen() {
  const { podId } = useLocalSearchParams<{ podId?: string }>();
  const isEdit = !!podId;

  const friends    = usePlannerStore((s) => s.friends);
  const { data: existing, isLoading: podLoading } = usePod(podId);
  const createPod  = useCreatePod();
  const updatePod  = useUpdatePod();
  const deletePod  = useDeletePod();

  const [name,  setName]  = useState('');
  const [emoji, setEmoji] = useState<string | null>('💜');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );

  // Hydrate when editing
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEmoji(existing.emoji ?? '💜');
    setMemberIds(new Set(existing.memberIds));
  }, [existing]);

  const toggleMember = useCallback((id: string) => {
    Haptics.selectionAsync();
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const saving = createPod.isPending || updatePod.isPending;

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Pod name required', 'Give your pod a name to save.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isEdit && podId) {
        await updatePod.mutateAsync({
          id: podId,
          name,
          emoji,
          memberIds: [...memberIds],
        });
      } else {
        await createPod.mutateAsync({
          name,
          emoji: emoji ?? undefined,
          memberIds: [...memberIds],
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Save pod failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save pod', err?.message ?? 'Please try again.');
    }
  }, [name, emoji, memberIds, isEdit, podId, createPod, updatePod]);

  const handleDelete = useCallback(() => {
    if (!isEdit || !podId) return;
    Alert.alert(
      'Delete pod?',
      `"${name}" will be removed. This doesn't unfriend anyone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deletePod.mutateAsync(podId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err: any) {
              console.error('Delete pod failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not delete', err?.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }, [isEdit, podId, name, deletePod]);

  const canSave = name.trim().length > 0 && !saving;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color={TC.icon} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">
          {isEdit ? 'Edit pod' : 'New pod'}
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSave ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              canSave ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {isEdit && podLoading ? (
          <ActivityIndicator className="mt-16" color="#23744D" />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 py-5 gap-5"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Emoji picker */}
            <View>
              <FieldLabel>Emoji</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {POD_EMOJIS.map((e) => {
                  const selected = emoji === e;
                  return (
                    <Pressable
                      key={e}
                      onPress={() => { Haptics.selectionAsync(); setEmoji(e); }}
                      className={`w-12 h-12 rounded-xl items-center justify-center border ${
                        selected ? 'border-primary bg-primary/10' : 'border-border/40 bg-card'
                      }`}
                    >
                      <Text style={{ fontSize: 22 }}>{e}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Name */}
            <View>
              <FieldLabel>Pod name</FieldLabel>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Close friends, Run club, Brunch crew"
                placeholderTextColor="#929298"
                className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
                maxLength={40}
                autoFocus={!isEdit}
              />
            </View>

            {/* Members */}
            {connectedFriends.length > 0 ? (
              <View>
                <View className="flex-row items-center justify-between mb-2 px-0.5">
                  <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Members
                  </Text>
                  {memberIds.size > 0 && (
                    <Text className="font-sans text-[11px] font-semibold text-primary">
                      {memberIds.size} selected
                    </Text>
                  )}
                </View>
                <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                  {connectedFriends.map((f, i) => {
                    const checked = memberIds.has(f.friendUserId!);
                    return (
                      <View key={f.id}>
                        <Pressable
                          onPress={() => toggleMember(f.friendUserId!)}
                          className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
                        >
                          <Avatar url={f.avatar} displayName={f.name} size="sm" />
                          <Text
                            className="flex-1 font-sans text-sm font-medium text-foreground"
                            numberOfLines={1}
                          >
                            {f.name}
                          </Text>
                          <View
                            style={{
                              width: 22, height: 22, borderRadius: 6,
                              borderWidth: 1.5,
                              borderColor: checked ? '#23744D' : TINT.grayStrong,
                              backgroundColor: checked ? '#23744D' : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                          </View>
                        </Pressable>
                        {i < connectedFriends.length - 1 && (
                          <View className="h-px bg-border/30 mx-4" />
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
                <Text className="font-sans text-sm text-muted-foreground">
                  No friends yet
                </Text>
                <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                  Add friends first, then add them to a pod.
                </Text>
              </View>
            )}

            {/* Delete button (edit mode only) */}
            {isEdit && (
              <Pressable
                onPress={handleDelete}
                disabled={deletePod.isPending}
                className="border border-destructive/30 rounded-xl py-3 items-center mt-4 active:opacity-70"
              >
                {deletePod.isPending ? (
                  <ActivityIndicator size="small" color="#D46549" />
                ) : (
                  <Text className="font-sans text-sm font-semibold text-destructive">
                    Delete pod
                  </Text>
                )}
              </Pressable>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
