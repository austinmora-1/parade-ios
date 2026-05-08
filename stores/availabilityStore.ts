import { create } from 'zustand';
import { DayAvailability, TimeSlot, LocationStatus, VibeType } from '@/types/planner';
import { addDays, startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { DefaultAvailabilitySettings } from './helpers/types';
import { createDefaultAvailability, mapAvailabilityRow, buildAvailabilityMap } from './helpers/mapAvailability';

export interface AvailabilityState {
  availability: DayAvailability[];
  availabilityMap: Record<string, DayAvailability>;
  locationStatus: LocationStatus;
  defaultSettings: DefaultAvailabilitySettings | null;
  homeAddress: string | null;
}

export interface AvailabilityActions {
  _setAvailability: (state: AvailabilityState) => void;
  setAvailability: (date: Date, slot: TimeSlot, available: boolean, userId: string) => Promise<void>;
  setLocationStatus: (status: LocationStatus, userId: string, date?: Date) => Promise<void>;
  getLocationStatusForDate: (date: Date) => LocationStatus;
  setVibeForDate: (date: Date, vibe: VibeType | null, userId: string, setCurrentVibe: (v: any) => void) => Promise<void>;
  getVibeForDate: (date: Date) => VibeType | null;
  loadAvailabilityForRange: (startDate: Date, endDate: Date, userId: string) => Promise<void>;
  initializeWeekAvailability: (userId: string | null, loadProfileAndAvailability: () => Promise<void>) => Promise<void>;
  loadProfileAndAvailability: (userId: string) => Promise<void>;
}

export const useAvailabilityStore = create<AvailabilityState & AvailabilityActions>((set, get) => ({
  availability: [],
  availabilityMap: {},
  locationStatus: 'home',
  defaultSettings: null,
  homeAddress: null,

  _setAvailability: (state) => set(state),

  setAvailability: async (date, slot, available, userId) => {
    if (!userId) return;

    const { availability, availabilityMap, defaultSettings } = get();
    const dateStr = format(date, 'yyyy-MM-dd');
    const slotColumn = slot.replace('-', '_');

    const { error } = await supabase
      .from('availability')
      .upsert({ user_id: userId, date: dateStr, [slotColumn]: available }, { onConflict: 'user_id,date' });

    if (error) {
      console.error('Error setting availability:', error);
      return;
    }

    const existing = availabilityMap[dateStr];
    if (existing) {
      const updatedEntry = { ...existing, slots: { ...existing.slots, [slot]: available } };
      const updated = availability.map(a => format(a.date, 'yyyy-MM-dd') === dateStr ? updatedEntry : a);
      set({ availability: updated, availabilityMap: { ...availabilityMap, [dateStr]: updatedEntry } });
    } else {
      const newAvailability = createDefaultAvailability(date, defaultSettings);
      newAvailability.slots[slot] = available;
      set({
        availability: [...availability, newAvailability],
        availabilityMap: { ...availabilityMap, [dateStr]: newAvailability },
      });
    }
  },

  setLocationStatus: async (status, userId, date) => {
    if (!userId) return;

    const { availability, availabilityMap, defaultSettings } = get();
    const targetDate = date || new Date();
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    const { error } = await supabase
      .from('availability')
      .upsert({ user_id: userId, date: dateStr, location_status: status }, { onConflict: 'user_id,date' });

    if (error) {
      console.error('Error setting location:', error);
      return;
    }

    const existing = availabilityMap[dateStr];
    if (existing) {
      const updatedEntry = { ...existing, locationStatus: status };
      const updated = availability.map(a => format(a.date, 'yyyy-MM-dd') === dateStr ? updatedEntry : a);
      set({ availability: updated, availabilityMap: { ...availabilityMap, [dateStr]: updatedEntry } });
    } else {
      const newAvailability = createDefaultAvailability(targetDate, defaultSettings);
      newAvailability.locationStatus = status;
      set({
        availability: [...availability, newAvailability],
        availabilityMap: { ...availabilityMap, [dateStr]: newAvailability },
      });
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (dateStr === todayStr) {
      set({ locationStatus: status });
    }
  },

  getLocationStatusForDate: (date) => {
    const { availabilityMap } = get();
    const dateStr = format(date, 'yyyy-MM-dd');
    return availabilityMap[dateStr]?.locationStatus || 'home';
  },

  getVibeForDate: (date) => {
    const { availabilityMap } = get();
    const dateStr = format(date, 'yyyy-MM-dd');
    return availabilityMap[dateStr]?.vibe || null;
  },

  setVibeForDate: async (date, vibe, userId, setCurrentVibe) => {
    if (!userId) return;

    const { availability, availabilityMap, defaultSettings } = get();
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = availabilityMap[dateStr];

    if (existing) {
      const updatedEntry = { ...existing, vibe };
      const updated = availability.map(a => format(a.date, 'yyyy-MM-dd') === dateStr ? updatedEntry : a);
      set({ availability: updated, availabilityMap: { ...availabilityMap, [dateStr]: updatedEntry } });
    } else {
      const newAvailability = createDefaultAvailability(date, defaultSettings);
      newAvailability.vibe = vibe;
      set({
        availability: [...availability, newAvailability],
        availabilityMap: { ...availabilityMap, [dateStr]: newAvailability },
      });
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isToday = dateStr === todayStr;
    if (isToday && vibe) {
      setCurrentVibe({ type: vibe });
    } else if (isToday && !vibe) {
      setCurrentVibe(null);
    }

    const { error } = await supabase
      .from('availability')
      .upsert({ user_id: userId, date: dateStr, vibe: vibe } as any, { onConflict: 'user_id,date' });

    if (error) {
      console.error('Error setting vibe for date:', error);
    }

    // When the target is today, also persist to profile so the dashboard
    // (which reads from profile.current_vibe) doesn't overwrite it on refresh.
    if (isToday) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ current_vibe: vibe || null })
        .eq('user_id', userId);
      if (profileErr) {
        console.error('Error syncing today vibe to profile:', profileErr);
      }
    }
  },

  loadAvailabilityForRange: async (startDate, endDate, userId) => {
    if (!userId) return;

    const { defaultSettings, availabilityMap: existingMap } = get();
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    let allCovered = true;
    let checkDate = startDate;
    while (checkDate <= endDate) {
      if (!existingMap[format(checkDate, 'yyyy-MM-dd')]) { allCovered = false; break; }
      checkDate = addDays(checkDate, 1);
    }
    if (allCovered) return;

    const { data, error } = await supabase
      .from('availability')
      .select('date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location, vibe')
      .eq('user_id', userId)
      .gte('date', startStr)
      .lte('date', endStr);

    if (error) {
      console.error('Error loading availability range:', error);
      return;
    }

    const fetchedMap = new Map<string, any>();
    for (const row of (data || [])) {
      fetchedMap.set(row.date, row);
    }

    const newMap = { ...existingMap };
    const newAvail = [...get().availability];
    let d = new Date(startDate);
    while (d <= endDate) {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!newMap[dateStr]) {
        const existing = fetchedMap.get(dateStr);
        const dayAvail: DayAvailability = existing
          ? mapAvailabilityRow(existing, new Date(d))
          : createDefaultAvailability(new Date(d), defaultSettings);
        newMap[dateStr] = dayAvail;
        newAvail.push(dayAvail);
      }
      d = addDays(d, 1);
    }

    set({ availability: newAvail, availabilityMap: newMap });
  },

  initializeWeekAvailability: async (userId, loadProfileAndAvailability) => {
    if (!userId) {
      const { defaultSettings } = get();
      const start = startOfWeek(new Date(), { weekStartsOn: 1 });
      const week: DayAvailability[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(createDefaultAvailability(addDays(start, i), defaultSettings));
      }
      set({ availability: week, availabilityMap: buildAvailabilityMap(week) });
      return;
    }
    await loadProfileAndAvailability();
  },

  loadProfileAndAvailability: async (userId) => {
    if (!userId) return;

    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const availStartDate = format(addDays(start, -183), 'yyyy-MM-dd');
    const availEndDate = format(addDays(start, 183), 'yyyy-MM-dd');

    const [availResult, profileResult] = await Promise.all([
      supabase.from('availability').select('*').eq('user_id', userId).gte('date', availStartDate).lte('date', availEndDate),
      supabase.from('profiles')
        .select('current_vibe, location_status, custom_vibe_tags, vibe_gif_url, default_work_days, default_work_start_hour, default_work_end_hour, default_availability_status, default_vibes, home_address, timezone')
        .eq('user_id', userId).single(),
    ]);

    const availData = availResult.data;
    const profile = profileResult.data;

    const defaultSettings: DefaultAvailabilitySettings = {
      workDays: (profile as any)?.default_work_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      workStartHour: (profile as any)?.default_work_start_hour ?? 9,
      workEndHour: (profile as any)?.default_work_end_hour ?? 17,
      defaultStatus: (profile as any)?.default_availability_status || 'free',
      defaultVibes: (profile as any)?.default_vibes || [],
    };

    const availDataMap = new Map<string, any>();
    if (availData) { for (const a of availData) availDataMap.set(a.date, a); }

    const allDates = Array.from({ length: 366 }, (_, i) => format(addDays(start, i - 183), 'yyyy-MM-dd'));
    const availabilityWithDefaults: DayAvailability[] = allDates.map((dateStr, i) => {
      const existing = availDataMap.get(dateStr);
      const date = addDays(start, i - 183);
      if (existing) return mapAvailabilityRow(existing, date);
      return createDefaultAvailability(date, defaultSettings);
    });

    const availabilityMap = buildAvailabilityMap(availabilityWithDefaults);
    const homeAddr = (profile as any)?.home_address || null;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayAvail = availabilityMap[todayStr];
    const todayLocationStatus = todayAvail?.locationStatus || 'home';

    set({
      availability: availabilityWithDefaults,
      availabilityMap,
      locationStatus: todayLocationStatus,
      defaultSettings,
      homeAddress: homeAddr,
    });
  },
}));
