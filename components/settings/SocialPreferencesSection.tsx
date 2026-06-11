import { View, Text, Pressable } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { SectionCard, SectionHeader } from '@/components/settings/SettingsPrimitives';
import {
  WorkScheduleSection,
  DAY_KEYS,
  DAY_LABELS,
} from '@/components/settings/WorkScheduleSection';

// ─── Social preferences constants ────────────────────────────────────────────

const INTEREST_OPTIONS = [
  'Foodie', 'Outdoors', 'Movies', 'Concerts', 'Sports', 'Reading',
  'Travel', 'Art', 'Gaming', 'Music', 'Cooking', 'Yoga', 'Coffee',
  'Cocktails', 'Nightlife', 'Photography', 'Hiking', 'Fitness',
];

const TIME_SLOT_OPTIONS = [
  { id: 'early-morning',   label: 'Early morning' },
  { id: 'late-morning',    label: 'Late morning' },
  { id: 'early-afternoon', label: 'Early afternoon' },
  { id: 'late-afternoon',  label: 'Late afternoon' },
  { id: 'evening',         label: 'Evening' },
  { id: 'late-night',      label: 'Late night' },
];

export function SocialPreferencesSection({
  interests,
  prefDays,
  prefTimes,
  workDays,
  workStart,
  workEnd,
  onToggleInterest,
  onTogglePrefDay,
  onTogglePrefTime,
  onToggleWorkDay,
  onWorkStartChange,
  onWorkEndChange,
}: {
  interests:         string[];
  prefDays:          string[];
  prefTimes:         string[];
  workDays:          string[];
  workStart:         number;
  workEnd:           number;
  onToggleInterest:  (value: string) => void;
  onTogglePrefDay:   (value: string) => void;
  onTogglePrefTime:  (value: string) => void;
  onToggleWorkDay:   (value: string) => void;
  onWorkStartChange: (v: number) => void;
  onWorkEndChange:   (v: number) => void;
}) {
  return (
    <SectionCard>
      <SectionHeader
        icon={<Sparkles size={14} color="#DFA53A" strokeWidth={2} />}
        label="Social Preferences"
      />

      {/* Interests */}
      <View className="px-4 py-3 border-b border-border/20">
        <Text className="font-sans text-sm font-medium text-foreground">
          Interests
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          Used to suggest plans you'd actually enjoy.
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {INTEREST_OPTIONS.map((opt) => {
            const selected = interests.includes(opt);
            return (
              <Pressable
                key={opt}
                onPress={() => onToggleInterest(opt)}
                className={`rounded-full px-2.5 py-1 border ${
                  selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                } active:opacity-70`}
              >
                <Text
                  className={`font-sans text-xs font-medium ${
                    selected ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Work Schedule */}
      <WorkScheduleSection
        workDays={workDays}
        workStart={workStart}
        workEnd={workEnd}
        onToggleWorkDay={onToggleWorkDay}
        onWorkStartChange={onWorkStartChange}
        onWorkEndChange={onWorkEndChange}
      />

      {/* Preferred days */}
      <View className="px-4 py-3 border-b border-border/20">
        <Text className="font-sans text-sm font-medium text-foreground">
          Preferred days
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          When you typically want to make plans.
        </Text>
        <View className="flex-row gap-1.5 mt-2">
          {DAY_KEYS.map((key, i) => {
            const selected = prefDays.includes(key);
            return (
              <Pressable
                key={key}
                onPress={() => onTogglePrefDay(key)}
                className={`flex-1 h-9 rounded-xl border items-center justify-center active:opacity-70 ${
                  selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                }`}
              >
                <Text
                  className={`font-sans text-xs font-semibold ${
                    selected ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {DAY_LABELS[i]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Preferred times */}
      <View className="px-4 py-3">
        <Text className="font-sans text-sm font-medium text-foreground">
          Preferred times
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          When you're typically up for hanging out.
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {TIME_SLOT_OPTIONS.map((opt) => {
            const selected = prefTimes.includes(opt.id);
            return (
              <Pressable
                key={opt.id}
                onPress={() => onTogglePrefTime(opt.id)}
                className={`rounded-full px-2.5 py-1 border ${
                  selected ? 'bg-primary border-primary' : 'bg-card border-border/40'
                } active:opacity-70`}
              >
                <Text
                  className={`font-sans text-xs font-medium ${
                    selected ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SectionCard>
  );
}
