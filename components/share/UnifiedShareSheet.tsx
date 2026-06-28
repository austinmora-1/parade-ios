/**
 * UnifiedShareSheet — one share modal for plans, trips, and anything else
 * (XPE-165). Replaces the near-duplicate SharePlanModal + ShareTripModal:
 * provides the bottom-sheet chrome + link resolution, and renders the shared
 * ShareChannelGrid (Messages / WhatsApp / Telegram / Email / Copy / native
 * More) for the actual channels.
 *
 * The caller supplies a `resolve()` that mints/looks up the share link and
 * builds the message when the sheet opens. `resolve` is read through a ref, so
 * it re-runs only when the sheet opens — callers don't need to memoize it.
 */
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react-native';
import { ShareChannelGrid } from '@/components/share/ShareChannelGrid';
import { PARADE_GREEN } from '@/lib/colors';
import { TC } from '@/lib/theme';

export interface ShareContent {
  /** Share URL. */
  link: string;
  /** Message text; ShareChannelGrid appends the link for body-bearing channels. */
  message: string;
}

interface UnifiedShareSheetProps {
  visible: boolean;
  onClose: () => void;
  heading: string;
  subheading: string;
  emailSubject: string;
  /** Title for the OS share sheet ("More"). */
  shareTitle: string;
  /** Mint/resolve the link + message when the sheet opens. Return null on failure. */
  resolve: () => Promise<ShareContent | null>;
}

export function UnifiedShareSheet({
  visible,
  onClose,
  heading,
  subheading,
  emailSubject,
  shareTitle,
  resolve,
}: UnifiedShareSheetProps) {
  const [content, setContent] = useState<ShareContent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Read resolve through a ref so the effect depends only on `visible` — the
  // caller can pass a fresh inline arrow without retriggering the resolve.
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    if (!visible) {
      setContent(null);
      setStatus('loading');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setContent(null);
    resolveRef
      .current()
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          setStatus('error');
          return;
        }
        setContent(r);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('Share link failed', err);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        {/* Sheet — swallow taps so the backdrop close doesn't fire */}
        <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10 gap-4" onPress={() => {}}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-display text-xl text-foreground">{heading}</Text>
              <Text className="font-sans text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                {subheading}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full items-center justify-center bg-muted/60 active:opacity-70"
            >
              <X size={16} color={TC.icon} strokeWidth={2} />
            </Pressable>
          </View>

          {status === 'error' ? (
            <View className="items-center py-6 gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                Couldn't create a share link.
              </Text>
              <Text className="font-sans text-xs text-muted-foreground">
                Check your connection and try again.
              </Text>
            </View>
          ) : status === 'loading' || !content ? (
            <View className="items-center py-6">
              <ActivityIndicator color={PARADE_GREEN} />
            </View>
          ) : (
            <ShareChannelGrid
              link={content.link}
              message={content.message}
              emailSubject={emailSubject}
              title={shareTitle}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default UnifiedShareSheet;
