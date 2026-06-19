/**
 * VibeCard — "Your vibe" selector on the Home dashboard (parity with the
 * PWA VibeAndIntentionsCard's top section). Shows the current vibe (colored
 * icon tile + label + custom tags + optional GIF), and taps open an inline
 * picker with the four vibe options, a custom-tag input, and a GIF picker.
 *
 * Backed by the existing vibe store (plannerStore.setVibe / addCustomVibe /
 * removeCustomVibe), which persists to profiles.current_vibe,
 * .custom_vibe_tags and .vibe_gif_url.
 */
import { View, Text, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Sparkles, Pencil, Check, X, Film } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { VIBE_CONFIG, getAllVibes, type VibeType } from '@/types/planner';
import { GifPickerModal } from '@/components/primitives/GifPickerModal';
import { ELEPHANT } from '@/lib/colors';

/** Per-vibe chip colors (HSL, mirrors the PWA VIBE_CHIP_STYLES). */
const VIBE_CHIP: Record<VibeType, { tile: string; text: string }> = {
  social:     { tile: 'hsl(5 80% 65%)',    text: 'hsl(5 50% 45%)'   },
  chill:      { tile: 'hsl(203 60% 55%)',  text: 'hsl(203 45% 40%)' },
  athletic:   { tile: 'hsl(152 39% 39%)',  text: 'hsl(152 35% 35%)' },
  productive: { tile: 'hsl(49 80% 50%)',   text: 'hsl(49 50% 38%)'  },
  custom:     { tile: 'hsl(9 60% 60%)',    text: 'hsl(9 40% 45%)'   },
};

export function VibeCard() {
  const currentVibe   = usePlannerStore((s) => s.currentVibe);
  const setVibe       = usePlannerStore((s) => s.setVibe);
  const addCustomVibe = usePlannerStore((s) => s.addCustomVibe);
  const removeCustomVibe = usePlannerStore((s) => s.removeCustomVibe);

  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [gifOpen, setGifOpen] = useState(false);

  const vibeTypes = getAllVibes(); // social / chill / athletic / productive
  const selectedConfig = currentVibe?.type ? VIBE_CONFIG[currentVibe.type] : null;
  const selectedChip = currentVibe?.type ? VIBE_CHIP[currentVibe.type] : null;
  const SelectedIcon = selectedConfig?.icon ?? Sparkles;

  const selectVibe = (type: VibeType) => {
    Haptics.selectionAsync();
    setVibe({ type, gifUrl: currentVibe?.gifUrl, customTags: currentVibe?.customTags });
    setOpen(false);
  };

  const submitCustom = () => {
    const tag = customText.trim().replace(/\s+/g, '');
    if (!tag) return;
    Haptics.selectionAsync();
    addCustomVibe(tag);
    setCustomText('');
  };

  const handleGifSelect = (gifUrl: string) => {
    Haptics.selectionAsync();
    setVibe({ type: currentVibe?.type ?? 'social', gifUrl, customTags: currentVibe?.customTags });
    setGifOpen(false);
    setOpen(false);
  };

  return (
    <View className="gap-3">
      {/* Section eyebrow */}
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Sparkles size={12} color={ELEPHANT} strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Your vibe
        </Text>
      </View>

      <View className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm">
        {/* Header — current vibe summary, taps to expand */}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setOpen((o) => !o); }}
          className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
        >
          <View
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: selectedChip?.tile ?? ELEPHANT }}
          >
            <SelectedIcon size={17} color="#FFFFFF" strokeWidth={2} />
          </View>
          <View className="flex-1">
            {currentVibe?.type ? (
              <View className="flex-row items-center gap-1.5 flex-wrap">
                <Text
                  className="font-display text-[15px]"
                  style={{ color: selectedChip?.text ?? '#2F4F3F' }}
                >
                  {selectedConfig?.label ?? 'Custom'}
                </Text>
                {currentVibe.customTags && currentVibe.customTags.length > 0 && (
                  <Text className="font-sans text-xs text-muted-foreground">
                    {currentVibe.customTags.map((t) => `#${t}`).join(' ')}
                  </Text>
                )}
                {currentVibe.gifUrl && (
                  <Text className="font-sans text-[10px] text-muted-foreground">+ GIF</Text>
                )}
              </View>
            ) : (
              <Text className="font-display text-[15px] text-muted-foreground">
                What's your vibe?
              </Text>
            )}
          </View>
          <Text className="font-sans text-xs font-semibold text-primary">
            {open ? 'Done' : 'Change'}
          </Text>
        </Pressable>

        {/* GIF preview (collapsed state) */}
        {currentVibe?.gifUrl && !open && (
          <View className="px-4 pb-3">
            <View className="rounded-xl overflow-hidden border border-border/30 self-start">
              <Image
                source={{ uri: currentVibe.gifUrl }}
                style={{ width: 120, height: 80 }}
                contentFit="cover"
                transition={150}
              />
              <Pressable
                onPress={() => setVibe({ ...currentVibe, gifUrl: undefined })}
                hitSlop={6}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 items-center justify-center active:opacity-70"
              >
                <X size={13} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Custom tag pills (collapsed state) */}
        {currentVibe?.customTags && currentVibe.customTags.length > 0 && !open && (
          <View className="px-4 pb-3 flex-row flex-wrap gap-1.5">
            {currentVibe.customTags.map((tag) => (
              <View
                key={tag}
                className="flex-row items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1.5 py-1"
              >
                <Text className="font-sans text-xs font-medium text-primary">#{tag}</Text>
                <Pressable
                  onPress={() => removeCustomVibe(tag)}
                  hitSlop={6}
                  className="w-4 h-4 rounded-full items-center justify-center active:opacity-60"
                >
                  <X size={11} color="#23744D" strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Expanded picker */}
        {open && (
          <View className="px-4 pb-4 gap-2 border-t border-border/20 pt-3">
            {/* Vibe options */}
            {vibeTypes.map((type) => {
              const config = VIBE_CONFIG[type];
              const chip = VIBE_CHIP[type];
              const Icon = config.icon;
              const isSelected = currentVibe?.type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => selectVibe(type)}
                  className={`flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 active:opacity-80 ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border/40 bg-card'
                  }`}
                >
                  <View
                    className="w-7 h-7 rounded-lg items-center justify-center"
                    style={{ backgroundColor: chip.tile }}
                  >
                    <Icon size={15} color="#FFFFFF" strokeWidth={2} />
                  </View>
                  <Text
                    className={`flex-1 font-sans text-sm font-medium ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {config.label}
                  </Text>
                  {isSelected && <Check size={16} color="#23744D" strokeWidth={2.5} />}
                </Pressable>
              );
            })}

            {/* Custom tag input */}
            <View className="flex-row items-center gap-2 rounded-2xl border border-border/40 bg-card px-3 py-2">
              <Pencil size={15} color={ELEPHANT} strokeWidth={2} />
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                onSubmitEditing={submitCustom}
                placeholder="Add a custom tag…"
                placeholderTextColor="#929298"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                className="flex-1 font-sans text-sm text-foreground py-1"
              />
              {customText.trim().length > 0 && (
                <Pressable onPress={submitCustom} hitSlop={6} className="active:opacity-70">
                  <Text className="font-sans text-xs font-semibold text-primary">Add</Text>
                </Pressable>
              )}
            </View>

            {/* Add a GIF */}
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setGifOpen(true); }}
              className="flex-row items-center gap-3 rounded-2xl border border-border/40 bg-card px-3 py-2.5 active:opacity-80"
            >
              <View className="w-7 h-7 rounded-lg items-center justify-center bg-muted">
                <Film size={15} color={ELEPHANT} strokeWidth={2} />
              </View>
              <Text className="flex-1 font-sans text-sm font-medium text-foreground">
                {currentVibe?.gifUrl ? 'Change GIF' : 'Add a GIF'}
              </Text>
            </Pressable>

            {/* Active custom tags (editable inside the open picker too) */}
            {currentVibe?.customTags && currentVibe.customTags.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5 pt-0.5">
                {currentVibe.customTags.map((tag) => (
                  <View
                    key={tag}
                    className="flex-row items-center gap-1 rounded-full bg-primary/10 pl-2.5 pr-1.5 py-1"
                  >
                    <Text className="font-sans text-xs font-medium text-primary">#{tag}</Text>
                    <Pressable
                      onPress={() => removeCustomVibe(tag)}
                      hitSlop={6}
                      className="w-4 h-4 rounded-full items-center justify-center active:opacity-60"
                    >
                      <X size={11} color="#23744D" strokeWidth={2.5} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <GifPickerModal
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={handleGifSelect}
      />
    </View>
  );
}
