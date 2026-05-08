import { create } from 'zustand';
import { Vibe, VibeType } from '@/types/planner';
import { supabase } from '@/integrations/supabase/client';

export interface VibeState {
  currentVibe: Vibe | null;
  userTimezone: string;
  initializedUserId: string | null;
}

export interface VibeActions {
  _setVibe: (currentVibe: Vibe | null) => void;
  _setTimezone: (tz: string) => void;
  /** One-shot initial hydration from cache/RPC. Ignored once initialized for this user. */
  bootstrapVibe: (currentVibe: Vibe | null, userId: string) => void;
  /** Apply a fresh profile row from a Realtime UPDATE event. Always wins. */
  applyRealtimeUpdate: (profileRow: any) => void;
  setVibe: (vibe: Vibe | null, userId: string) => Promise<void>;
  addCustomVibe: (tag: string, userId: string) => Promise<void>;
  removeCustomVibe: (tag: string, userId: string) => Promise<void>;
}

function profileRowToVibe(row: any): Vibe | null {
  if (!row) return null;
  const type = (row.current_vibe || null) as VibeType | null;
  const gifUrl = row.vibe_gif_url || undefined;
  const customTags = (row.custom_vibe_tags || []) as string[];
  if (!type && !gifUrl && customTags.length === 0) return null;
  return { type: type || 'custom', customTags, gifUrl };
}

export const useVibeStore = create<VibeState & VibeActions>((set, get) => ({
  currentVibe: null,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  initializedUserId: null,

  _setVibe: (currentVibe) => set({ currentVibe }),
  _setTimezone: (tz) => set({ userTimezone: tz }),

  bootstrapVibe: (currentVibe, userId) => {
    const { initializedUserId } = get();
    if (initializedUserId === userId) return; // already hydrated for this user
    set({ currentVibe, initializedUserId: userId });
  },

  applyRealtimeUpdate: (profileRow) => {
    set({ currentVibe: profileRowToVibe(profileRow) });
  },

  setVibe: async (vibe, userId) => {
    if (!userId) return;
    const snapshot = get().currentVibe;

    // Optimistic
    set({ currentVibe: vibe, initializedUserId: userId });

    const { error } = await supabase
      .from('profiles')
      .update({
        current_vibe: vibe?.type || null,
        vibe_gif_url: vibe?.gifUrl || null,
        custom_vibe_tags: vibe?.customTags || [],
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error setting vibe:', error);
      set({ currentVibe: snapshot });
    }
  },

  addCustomVibe: async (tag, userId) => {
    if (!userId) return;

    const { currentVibe } = get();
    const existingTags = currentVibe?.customTags || [];
    if (existingTags.includes(tag)) return;

    const newTags = [...existingTags, tag];
    const vibeType = currentVibe?.type || 'custom';
    const newVibe: Vibe = { type: vibeType, customTags: newTags, gifUrl: currentVibe?.gifUrl };
    const snapshot = currentVibe;

    set({ currentVibe: newVibe, initializedUserId: userId });

    const { error } = await supabase
      .from('profiles')
      .update({ current_vibe: vibeType, custom_vibe_tags: newTags })
      .eq('user_id', userId);

    if (error) {
      console.error('Error adding custom vibe:', error);
      set({ currentVibe: snapshot });
    }
  },

  removeCustomVibe: async (tag, userId) => {
    if (!userId) return;

    const { currentVibe } = get();
    const existingTags = currentVibe?.customTags || [];
    const newTags = existingTags.filter(t => t !== tag);
    const gifUrl = currentVibe?.gifUrl;
    const vibeType = currentVibe?.type || 'custom';
    const snapshot = currentVibe;

    if (newTags.length === 0) {
      const keepVibe = vibeType !== 'custom' || !!gifUrl;
      const next = keepVibe ? { type: vibeType, customTags: [], gifUrl } : null;

      set({ currentVibe: next, initializedUserId: userId });

      const { error } = await supabase
        .from('profiles')
        .update({ current_vibe: keepVibe ? vibeType : null, custom_vibe_tags: [] })
        .eq('user_id', userId);
      if (error) {
        console.error('Error removing custom vibe:', error);
        set({ currentVibe: snapshot });
      }
    } else {
      const next = { type: vibeType, customTags: newTags, gifUrl };
      set({ currentVibe: next, initializedUserId: userId });

      const { error } = await supabase
        .from('profiles')
        .update({ custom_vibe_tags: newTags })
        .eq('user_id', userId);
      if (error) {
        console.error('Error removing custom vibe:', error);
        set({ currentVibe: snapshot });
      }
    }
  },
}));
