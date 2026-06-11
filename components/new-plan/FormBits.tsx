import { View, Text, TextInput } from 'react-native';
import { FieldLabel } from '@/components/primitives/FieldLabel';

// Re-export for callers that import FieldLabel from FormBits (new-plan.tsx)
export { FieldLabel };

export function OpenInviteBanner() {
  return (
    <View className="bg-marigold/10 rounded-2xl px-4 py-3 flex-row items-start gap-2.5">
      <View className="w-1.5 h-1.5 rounded-full bg-marigold mt-1.5" />
      <Text className="font-sans text-xs text-foreground flex-1 leading-relaxed">
        <Text className="font-semibold">Open call.</Text> No invitee
        list — friends in your feed can claim this plan. Great for
        "I'm getting drinks Friday, who's around?"
      </Text>
    </View>
  );
}

export function TitleField({
  value,
  onChangeText,
  error,
}: {
  value: string;
  onChangeText: (t: string) => void;
  error: string | null;
}) {
  return (
    <View>
      <FieldLabel>What's the plan?</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="e.g. Drinks at Sway Bar"
        placeholderTextColor="#929298"
        className="bg-card rounded-xl border border-border/40 px-4 py-3 font-display text-base text-foreground shadow-sm"
        maxLength={100}
        autoFocus
      />
      {error && (
        <Text className="font-sans text-xs text-destructive mt-1.5 px-0.5">
          {error}
        </Text>
      )}
    </View>
  );
}

export function NotesField({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (t: string) => void;
}) {
  return (
    <View>
      <FieldLabel>Notes (optional)</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Any extra details…"
        placeholderTextColor="#929298"
        className="bg-card rounded-xl border border-border/40 px-4 py-3 font-sans text-sm text-foreground shadow-sm"
        maxLength={500}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
    </View>
  );
}
