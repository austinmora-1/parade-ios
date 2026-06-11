import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Users as UsersIcon, Lock } from 'lucide-react-native';
import { FieldLabel } from '@/components/primitives/FieldLabel';
import { Chip } from '@/components/primitives/Chip';
import { TC } from '@/lib/theme';
import type { Pod } from '@/hooks/usePods';

export function VisibilityPicker({
  visibility,
  onChange,
  pods,
}: {
  /** 'private' | 'friends' | `pod:<id>` */
  visibility: string;
  onChange: (v: string) => void;
  pods: Pod[];
}) {
  return (
    <View>
      <FieldLabel>Who can see this plan</FieldLabel>
      <View className="flex-row flex-wrap gap-2">
        <Chip
          selected={visibility === 'private'}
          onPress={() => { Haptics.selectionAsync(); onChange('private'); }}
        >
          <Lock size={12} color={visibility === 'private' ? '#FFFFFF' : TC.icon} strokeWidth={2.2} />
          <Text className={`font-sans text-xs font-semibold ${
            visibility === 'private' ? 'text-white' : 'text-foreground'
          }`}>
            Only invitees
          </Text>
        </Chip>
        <Chip
          selected={visibility === 'friends'}
          onPress={() => { Haptics.selectionAsync(); onChange('friends'); }}
        >
          <UsersIcon size={12} color={visibility === 'friends' ? '#FFFFFF' : TC.icon} strokeWidth={2.2} />
          <Text className={`font-sans text-xs font-semibold ${
            visibility === 'friends' ? 'text-white' : 'text-foreground'
          }`}>
            All friends
          </Text>
        </Chip>
        {pods.map((pod) => {
          const v = `pod:${pod.id}`;
          const selected = visibility === v;
          return (
            <Chip
              key={pod.id}
              selected={selected}
              onPress={() => { Haptics.selectionAsync(); onChange(v); }}
            >
              <Text style={{ fontSize: 13 }}>{pod.emoji ?? '💜'}</Text>
              <Text className={`font-sans text-xs font-semibold ${
                selected ? 'text-white' : 'text-foreground'
              }`}>
                {pod.name}
              </Text>
            </Chip>
          );
        })}
      </View>
      <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
        {visibility === 'private'
          ? 'Only invited friends will see this plan.'
          : visibility === 'friends'
            ? 'Visible in all friends\' feeds.'
            : 'Visible to this pod\'s members.'}
      </Text>
    </View>
  );
}
