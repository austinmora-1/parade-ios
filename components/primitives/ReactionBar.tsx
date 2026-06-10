/**
 * ReactionBar — horizontal row of emoji+count pills plus an "add reaction"
 * affordance. Used on plan detail, comments, and photos.
 *
 * Layout: existing reactions render as pills (mine highlighted in primary tint).
 * A trailing "+" button opens the EmojiReactionPicker sheet.
 *
 * Props:
 *   target      polymorphic target type
 *   targetId    uuid of the target row
 *   align       'left' | 'right' (default 'left')
 *   compact     if true, smaller pills (used inside comment rows)
 */
import { useState, useCallback } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SmilePlus } from 'lucide-react-native';
import {
  useReactions,
  useToggleReaction,
  DEFAULT_REACTION_EMOJIS,
  type ReactionTarget,
} from '@/hooks/useReactions';

// ─── Picker sheet ────────────────────────────────────────────────────────────

interface PickerProps {
  visible:  boolean;
  onClose:  () => void;
  onPick:   (emoji: string) => void;
}

export function EmojiReactionSheet({ visible, onClose, onPick }: PickerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/40 px-8"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="bg-card rounded-3xl px-4 py-4 shadow-lg"
        >
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center mb-3">
            React with…
          </Text>
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            {DEFAULT_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onPick(emoji)}
                className="w-12 h-12 items-center justify-center rounded-2xl bg-chalk active:opacity-70"
              >
                <Text style={{ fontSize: 26 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface Props {
  target:    ReactionTarget;
  targetId:  string | undefined;
  align?:    'left' | 'right';
  compact?:  boolean;
  /** Hide the "+" button — used when the surrounding row already opens a picker. */
  hideAddButton?: boolean;
}

export function ReactionBar({ target, targetId, align = 'left', compact = false, hideAddButton = false }: Props) {
  const { data: reactions = [] } = useReactions(target, targetId);
  const toggle = useToggleReaction(target, targetId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleToggle = useCallback(
    (emoji: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toggle.mutate(emoji);
    },
    [toggle],
  );

  const handleAddPress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setPickerOpen(true);
  }, []);

  const handlePickEmoji = useCallback(
    (emoji: string) => {
      setPickerOpen(false);
      handleToggle(emoji);
    },
    [handleToggle],
  );

  // Nothing to show and add button is hidden? Render nothing.
  if (reactions.length === 0 && hideAddButton) return null;

  const pillPadH = compact ? 7 : 9;
  const pillPadV = compact ? 2 : 3;
  const emojiSize = compact ? 12 : 14;
  const countSize = compact ? 11 : 12;

  return (
    <>
      <View
        className="flex-row flex-wrap items-center gap-1.5"
        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
      >
        {reactions.map((r) => (
          <Pressable
            key={r.emoji}
            onPress={() => handleToggle(r.emoji)}
            className={`flex-row items-center gap-1 rounded-full border ${
              r.mine
                ? 'bg-primary/10 border-primary/30'
                : 'bg-card border-border/40'
            } active:opacity-70`}
            style={{ paddingHorizontal: pillPadH, paddingVertical: pillPadV }}
          >
            <Text style={{ fontSize: emojiSize }}>{r.emoji}</Text>
            <Text
              className={`font-sans font-semibold ${
                r.mine ? 'text-primary' : 'text-muted-foreground'
              }`}
              style={{ fontSize: countSize }}
            >
              {r.count}
            </Text>
          </Pressable>
        ))}

        {!hideAddButton && (
          <Pressable
            onPress={handleAddPress}
            hitSlop={6}
            className="flex-row items-center justify-center rounded-full border border-border/40 bg-card active:opacity-70"
            style={{
              paddingHorizontal: pillPadH,
              paddingVertical: pillPadV + 1,
            }}
          >
            <SmilePlus size={compact ? 12 : 14} color="#929298" strokeWidth={2} />
          </Pressable>
        )}
      </View>

      <EmojiReactionSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickEmoji}
      />
    </>
  );
}
