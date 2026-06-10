/**
 * LocationAutocomplete — Google Places search via Supabase Edge Function.
 *
 * Matches PWA data contract exactly:
 *   - Edge fn: `google-places-search` (JWT-auth'd proxy that hides the API key)
 *   - Request: { query, types }
 *   - Response: { suggestions: [{ place_id, display_name, main_text, secondary_text }] }
 *   - On select: writes "<main_text>, <first secondary_text segment>" to value
 *
 * Props mirror a controlled TextInput plus an optional `types` prop:
 *   - types="(cities)" → city-only suggestions (default — matches PWA)
 *   - types="establishment|geocode" → businesses + general places (for plan
 *     location: a bar, restaurant, neighborhood, etc.)
 */
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MapPin, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/integrations/supabase/client';

// ─── Types matching the edge function response ───────────────────────────────

export interface LocationSuggestion {
  place_id:       string;
  display_name:   string;
  main_text:      string;
  secondary_text: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Google Places `types` param. Defaults to '(cities)' matching PWA */
  types?: string;
  /** Tailwind classes to merge into the input wrapper */
  className?: string;
  /** Multiline (for plan location where address can be long). Default false */
  multiline?: boolean;
}

// ─── Composed display string (matches PWA strip-country logic) ───────────────

function composeDisplay(s: LocationSuggestion): string {
  // Take the first comma-separated segment of secondary_text (drops country)
  const firstSec = (s.secondary_text || '').split(',')[0].trim();
  if (!firstSec || firstSec === s.main_text) return s.main_text;
  return `${s.main_text}, ${firstSec}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Search…',
  types = '(cities)',
  className = '',
  multiline = false,
}: LocationAutocompleteProps) {
  const [focused,   setFocused]   = useState(false);
  const [query,     setQuery]     = useState(value);
  const [debounced, setDebounced] = useState('');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [hasPicked, setHasPicked] = useState(false);

  // Keep internal `query` in sync if parent changes `value`
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounce the input by 300ms before hitting the edge function
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  // Skip search if just-picked → user tapped a suggestion, don't immediately re-search
  const lastQueryRef = useRef('');

  useEffect(() => {
    if (debounced.length < 2 || !focused) {
      setSuggestions([]);
      return;
    }
    if (hasPicked && debounced === lastQueryRef.current) {
      // User picked a value, don't re-query for the same string
      return;
    }
    lastQueryRef.current = debounced;
    setLoading(true);

    let cancelled = false;
    supabase.functions
      .invoke('google-places-search', { body: { query: debounced, types } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[location-autocomplete] edge fn error:', error);
          setSuggestions([]);
        } else {
          setSuggestions((data?.suggestions ?? []) as LocationSuggestion[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, focused, types, hasPicked]);

  const handlePick = (s: LocationSuggestion) => {
    Haptics.selectionAsync();
    const composed = composeDisplay(s);
    setQuery(composed);
    onChange(composed);
    setHasPicked(true);
    setSuggestions([]);
    // Defer blur so the press registers before keyboard closes
    setTimeout(() => setFocused(false), 50);
  };

  const handleClear = () => {
    Haptics.selectionAsync();
    setQuery('');
    onChange('');
    setHasPicked(false);
    setSuggestions([]);
  };

  const showDropdown =
    focused && debounced.length >= 2 && (loading || suggestions.length > 0);

  return (
    <View>
      <View
        className={`bg-card rounded-xl border border-border/40 px-3 flex-row items-center gap-2 shadow-sm ${className}`}
      >
        <MapPin size={15} color="#929298" strokeWidth={1.75} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setHasPicked(false);
          }}
          placeholder={placeholder}
          placeholderTextColor="#929298"
          className="flex-1 font-sans text-sm text-foreground py-3"
          autoCapitalize="none"
          autoCorrect={false}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Slight delay so suggestion taps register before blur clears them
            setTimeout(() => setFocused(false), 150);
          }}
        />
        {loading && focused && (
          <ActivityIndicator size="small" color="#929298" />
        )}
        {!loading && query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={6}>
            <X size={14} color="#929298" strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {/* Suggestions dropdown — anchored below the input */}
      {showDropdown && (
        <View
          className="bg-card rounded-xl border border-border/30 mt-1.5 overflow-hidden shadow-sm"
          style={{ maxHeight: 240 }}
        >
          {loading && suggestions.length === 0 ? (
            <View className="px-4 py-3 flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#929298" />
              <Text className="font-sans text-xs text-muted-foreground">
                Searching…
              </Text>
            </View>
          ) : (
            suggestions.slice(0, 6).map((s, i) => (
              <Pressable
                key={s.place_id}
                onPress={() => handlePick(s)}
                className={`px-3.5 py-2.5 flex-row items-center gap-2.5 active:bg-muted/40 ${
                  i < suggestions.length - 1 ? 'border-b border-border/20' : ''
                }`}
              >
                <MapPin size={13} color="#23744D" strokeWidth={2} />
                <View className="flex-1 min-w-0">
                  <Text
                    className="font-sans text-sm font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {s.main_text}
                  </Text>
                  {s.secondary_text ? (
                    <Text
                      className="font-sans text-[11px] text-muted-foreground"
                      numberOfLines={1}
                    >
                      {s.secondary_text}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}
