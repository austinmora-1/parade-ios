import {
  ActivityPicker as ActivityChipRow,
  type ActivityOption,
} from '@/components/primitives/ActivityPicker';

const ACTIVITIES: ActivityOption[] = [
  { id: 'drinks',      label: 'Drinks',     emoji: '🍹' },
  { id: 'dinner',      label: 'Dinner',     emoji: '🍝' },
  { id: 'brunch',      label: 'Brunch',     emoji: '🥞' },
  { id: 'coffee',      label: 'Coffee',     emoji: '☕' },
  { id: 'happy-hour',  label: 'Happy hour', emoji: '🍻' },
  { id: 'hike',        label: 'Hike',       emoji: '🥾' },
  { id: 'run',         label: 'Run',        emoji: '🏃' },
  { id: 'gym',         label: 'Gym',        emoji: '🏋️' },
  { id: 'movie',       label: 'Movie',      emoji: '🎬' },
  { id: 'concert',     label: 'Concert',    emoji: '🎵' },
  { id: 'sports',      label: 'Sports',     emoji: '⚽' },
  { id: 'park',        label: 'Park',       emoji: '🌳' },
  { id: 'beach',       label: 'Beach',      emoji: '🏖️' },
  { id: 'meetup',      label: 'Meetup',     emoji: '👋' },
  { id: 'travel',      label: 'Travel',     emoji: '✈️' },
  { id: 'other',       label: 'Other',      emoji: '✨' },
];

export function ActivityPicker({
  activity,
  onSelect,
}: {
  activity: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ActivityChipRow
      activities={ACTIVITIES}
      activity={activity}
      onSelect={onSelect}
    />
  );
}
