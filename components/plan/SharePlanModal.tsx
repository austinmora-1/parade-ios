/**
 * SharePlanModal — share a plan's unique join link.
 *
 * Creates a plan_invites row on open (same flow as the PWA; RLS allows
 * owners and participants) and offers one-tap shares: Messages, WhatsApp,
 * Signal, or copy. Signal has no compose-with-text deep link, so that row
 * copies the link first and then opens the app.
 */
import { Modal, View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { MessageSquare, MessageCircle, Shield, Link2, Check, X } from 'lucide-react-native';
import { supabase } from '@/integrations/supabase/client';
import { PARADE_GREEN, ELEPHANT, tint } from '@/lib/colors';
import { TC } from '@/lib/theme';

const WHATSAPP_GREEN = '#25D366';
const SIGNAL_BLUE = '#3A76F0';

interface SharePlanModalProps {
  visible: boolean;
  onClose: () => void;
  planId: string;
  planTitle?: string | null;
  /** The current user's id — used as invited_by on the invite row. */
  userId: string;
}

export function SharePlanModal({ visible, onClose, planId, planTitle, userId }: SharePlanModalProps) {
  const [link, setLink] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const message = `Join my plan "${planTitle || 'on Parade'}" — ${link ?? ''}`;

  // Mint a fresh invite link each time the modal opens
  useEffect(() => {
    if (!visible) {
      setCopied(false);
      return;
    }
    setLink(null);
    setLoadFailed(false);
    (async () => {
      const { data, error } = await supabase
        .from('plan_invites')
        .insert({ plan_id: planId, invited_by: userId } as any)
        .select('invite_token')
        .single();
      if (error || !data) {
        console.error('Invite link failed', error);
        setLoadFailed(true);
        return;
      }
      setLink(`https://helloparade.app/invite.html?t=${(data as any).invite_token}`);
    })();
  }, [visible, planId, userId]);

  const copyLink = async () => {
    if (!link) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(link);
    setCopied(true);
  };

  const openShareTarget = async (url: string, fallbackUrl?: string) => {
    if (!link) return;
    Haptics.selectionAsync();
    try {
      await Linking.openURL(url);
      onClose();
    } catch {
      if (fallbackUrl) {
        try {
          await Linking.openURL(fallbackUrl);
          onClose();
          return;
        } catch { /* fall through to alert */ }
      }
      Alert.alert('App not available', 'That app does not appear to be installed.');
    }
  };

  const shareViaSignal = async () => {
    if (!link) return;
    // Signal can't prefill a message — copy first, then hand off
    await Clipboard.setStringAsync(message);
    openShareTarget('sgnl://');
  };

  const rows: Array<{
    key: string;
    label: string;
    sublabel?: string;
    icon: React.ReactNode;
    chipBg: string;
    onPress: () => void;
  }> = [
    {
      key: 'sms',
      label: 'Messages',
      icon: <MessageSquare size={18} color={PARADE_GREEN} strokeWidth={2} />,
      chipBg: tint(PARADE_GREEN, 0.12),
      onPress: () => openShareTarget(`sms:&body=${encodeURIComponent(message)}`),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageCircle size={18} color={WHATSAPP_GREEN} strokeWidth={2} />,
      chipBg: tint(WHATSAPP_GREEN, 0.12),
      onPress: () =>
        openShareTarget(
          `whatsapp://send?text=${encodeURIComponent(message)}`,
          `https://wa.me/?text=${encodeURIComponent(message)}`,
        ),
    },
    {
      key: 'signal',
      label: 'Signal',
      sublabel: 'Copies the link, then opens Signal',
      icon: <Shield size={18} color={SIGNAL_BLUE} strokeWidth={2} />,
      chipBg: tint(SIGNAL_BLUE, 0.12),
      onPress: shareViaSignal,
    },
    {
      key: 'copy',
      label: copied ? 'Copied!' : 'Copy link',
      icon: copied
        ? <Check size={18} color={PARADE_GREEN} strokeWidth={2.5} />
        : <Link2 size={18} color={ELEPHANT} strokeWidth={2} />,
      chipBg: copied ? tint(PARADE_GREEN, 0.12) : tint(ELEPHANT, 0.12),
      onPress: copyLink,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        {/* Sheet — swallow taps so the backdrop close doesn't fire */}
        <Pressable className="bg-card rounded-t-3xl px-5 pt-5 pb-10 gap-4" onPress={() => {}}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-display text-xl text-foreground">Share plan</Text>
              <Text className="font-sans text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                Anyone with the link can ask to join{planTitle ? ` “${planTitle}”` : ''}
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

          {loadFailed ? (
            <View className="items-center py-6 gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                Couldn't create a share link.
              </Text>
              <Text className="font-sans text-xs text-muted-foreground">
                Check your connection and try again.
              </Text>
            </View>
          ) : !link ? (
            <View className="items-center py-6">
              <ActivityIndicator color={PARADE_GREEN} />
            </View>
          ) : (
            <View className="gap-1">
              {/* Link preview */}
              <View className="bg-muted/50 rounded-xl px-3.5 py-2.5 mb-2">
                <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
                  {link}
                </Text>
              </View>

              {rows.map((row) => (
                <Pressable
                  key={row.key}
                  onPress={row.onPress}
                  className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-muted/50"
                  accessibilityLabel={row.label}
                >
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: row.chipBg }}
                  >
                    {row.icon}
                  </View>
                  <View className="flex-1">
                    <Text className="font-sans text-[15px] text-foreground">{row.label}</Text>
                    {row.sublabel ? (
                      <Text className="font-sans text-[11px] text-muted-foreground">
                        {row.sublabel}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
