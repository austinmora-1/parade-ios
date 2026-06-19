/**
 * GifPickerModal — full-screen GIF search backed by the `giphy-search`
 * Supabase edge function (same backend the PWA GifPicker uses). Shows
 * trending GIFs on open, debounced search, 2-column grid with infinite
 * scroll. Calls onSelect(url) with the original GIF url and closes.
 *
 * The edge function is a GET with ?q=&limit=&offset= and returns
 * { gifs: { id, title, url, preview, width, height }[] }.
 */
import { Modal, View, Text, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react-native';
import { supabase } from '@/integrations/supabase/client';
import { PARADE_GREEN, ELEPHANT } from '@/lib/colors';
import { TC } from '@/lib/theme';

interface GifResult {
  id: string;
  title: string;
  url: string;      // original (stored on the vibe)
  preview: string;  // fixed-width thumbnail (grid)
  width: number;
  height: number;
}

const PAGE_SIZE = 21; // multiple of 3 → clean grid tail

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function GifPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen GIF's original url. Caller closes the modal. */
  onSelect: (gifUrl: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchGifs = useCallback(async (searchQuery: string, offset = 0, append = false) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (searchQuery) params.set('q', searchQuery);

      const accessToken = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/giphy-search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken || ANON_KEY}`,
          apikey: ANON_KEY ?? '',
        },
      });
      if (!res.ok) throw new Error('Failed to fetch GIFs');
      const result = await res.json();
      const newGifs: GifResult[] = result.gifs ?? [];

      setHasMore(newGifs.length >= PAGE_SIZE);
      offsetRef.current = offset + newGifs.length;
      setGifs((prev) => (append ? [...prev, ...newGifs] : newGifs));
    } catch (err) {
      console.error('GIF fetch error:', err);
      if (!append) setGifs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Reset + load trending whenever the modal opens
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    offsetRef.current = 0;
    fetchGifs('');
  }, [visible, fetchGifs]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0;
      fetchGifs(query);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, visible, fetchGifs]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchGifs(query, offsetRef.current, true);
  }, [loading, loadingMore, hasMore, query, fetchGifs]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          >
            <X size={20} color={TC.icon} strokeWidth={2} />
          </Pressable>
          <Text className="font-display text-base text-foreground">Pick a GIF</Text>
          <View className="w-9 h-9" />
        </View>

        {/* Search */}
        <View className="px-4 pt-3 pb-2">
          <View className="flex-row items-center bg-card rounded-xl border border-border/40 px-3 gap-2">
            <Search size={16} color={ELEPHANT} strokeWidth={2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIFs…"
              placeholderTextColor="#929298"
              autoCorrect={false}
              className="flex-1 py-2.5 font-sans text-sm text-foreground"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} className="active:opacity-60">
                <X size={15} color={ELEPHANT} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Grid */}
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={PARADE_GREEN} />
          </View>
        ) : gifs.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="font-sans text-sm text-muted-foreground text-center">
              {query ? 'No GIFs found' : 'Loading trending GIFs…'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={gifs}
            keyExtractor={(g) => g.id}
            numColumns={3}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            columnWrapperStyle={{ gap: 6 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item.url)}
                className="flex-1 rounded-xl overflow-hidden active:opacity-70"
                style={{ aspectRatio: 1 }}
              >
                <Image
                  source={{ uri: item.preview }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={120}
                />
              </Pressable>
            )}
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color={ELEPHANT} />
                </View>
              ) : null
            }
          />
        )}

        {/* Attribution */}
        <View className="border-t border-border/20 px-4 py-2 items-end">
          <Text className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/50">
            Powered by GIPHY
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
