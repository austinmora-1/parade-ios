/**
 * "Other time options" — multi-option proposal list (create mode only).
 * Presentational; the extraOptions array lives in app/(app)/new-plan.tsx.
 */
import { View, Text, Pressable } from 'react-native';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { SLOTS } from '@/components/new-plan/TimeSlotPicker';
import type { TimeSlot } from '@/types/planner';

export function ExtraOptionsSection({
  extraOptions,
  onAdd,
  onRemove,
}: {
  extraOptions: Array<{ date: Date; slot: TimeSlot }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 px-0.5">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Other time options
        </Text>
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          className="active:opacity-60"
        >
          <Text className="font-sans text-xs font-semibold text-primary">
            + Add option
          </Text>
        </Pressable>
      </View>

      {extraOptions.length === 0 ? (
        <Text className="font-sans text-[11px] text-muted-foreground px-0.5">
          Add alternatives so participants can vote on the time.
        </Text>
      ) : (
        <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
          {extraOptions.map((opt, i) => (
            <View key={i}>
              <View className="px-4 py-3 flex-row items-center gap-2">
                <Text className="flex-1 font-sans text-sm text-foreground">
                  {format(opt.date, 'EEE, MMM d')} ·{' '}
                  {SLOTS.find((s) => s.id === opt.slot)?.label ?? opt.slot}
                </Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onRemove(i);
                  }}
                  hitSlop={6}
                  className="active:opacity-60"
                >
                  <X size={14} color="#929298" strokeWidth={2} />
                </Pressable>
              </View>
              {i < extraOptions.length - 1 && (
                <View className="h-px bg-border/30 mx-4" />
              )}
            </View>
          ))}
        </View>
      )}
      {extraOptions.length > 0 && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
          Plan ships as a proposal — invitees vote, then you finalize.
        </Text>
      )}
    </View>
  );
}
