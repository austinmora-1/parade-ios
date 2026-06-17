/**
 * ShareTripModal — share a trip, mirroring SharePlanModal.
 *
 * Proposal-backed trips mint a trip_proposal_invites join link (same flow as
 * the PWA, served by helloparade.app/invite.html?tt=…). Solo trips have no
 * join flow, so they share a descriptive message with the general app link.
 * One-tap targets: Messages, WhatsApp, Signal, or copy.
 */
import { Modal, View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { MessageSquare, MessageCircle, Shield, Link2, Check, X } from 'lucide-react-native';
import { supabase } from '@/integrations/supabase/client';
import { formatCityForDisplay } from '@/lib/formatCity';
import { PARADE_GREEN, ELEPHANT, tint } from '@/lib/colors';
import { TC } from '@/lib/theme';

const WHATSAPP_GREEN = '#25D366';
const SIGNAL_BLUE = '#3A76F0';

interface ShareTripModalProps {
  visible: boolean;
  onClose: () => void;
  trip: {
    id: string;
    name?: string | null;
    location?: string | null;
    start_date: string;
    end_date: string;
    proposal_id?: string | null;
  };
  /** The current user's id — used as invited_by on the invite row. */
  userId: string;
}

export function ShareTripModal({ visible, onClose, trip, userId }: ShareTripModalProps) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const city = trip.location ? formatCityForDisplay(trip.location) || trip.location : null;
  const title = trip.name || (city ? `Trip to ${city}` : 'my trip');
  const dateRange = `${format(new Date(trip.start_date + 'T00:00:00'), 'MMM d')} – ${format(
    new Date(trip.end_date + 'T00:00:00'),
    'MMM d',
  )}`;
  // Proposal-backed trips get a join link; solo trips share descriptive text.
  const hasJoinLink = !!trip.proposal_id;
  const message = hasJoinLink
    ? `Join me for "${title}" on Parade — ${link ?? ''}`
    : `I'll be away for "${title}" (${dateRange}). Find me on Parade — ${link ?? ''}`;

  // Resolve the share link each time the modal opens
  useEffect(() => {
    if (!visible) {
      setCopied(false);
      return;
    }
    setLink(null);
    setLoadFailed(false);
    setLoading(true);
    (async () => {
      // Solo trip: no join flow — share the general app link
      if (!trip.proposal_id) {
        setLink('https://helloparade.app');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('trip_proposal_invites')
        .insert({ proposal_id: trip.proposal_id, trip_id: trip.id, invited_by: userId } as any)
        .select('invite_token')
        .single();
      if (error || !data) {
        console.error('Trip invite link failed', error);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      setLink(`https://helloparade.app/invite.html?tt=${(data as any).invite_token}`);
      setLoading(false);
    })();
  }, [visible, trip.id, trip.proposal_id, userId]);

  const copyLink = async () => {
    if (!link) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Copy the join link itself when there is one; otherwise the full message
    await Clipboard.setStringAsync(hasJoinLink ? link : message);
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
      sublabel: 'Copies the message, then opens Signal',
      icon: <Shield size={18} color={SIGNAL_BLUE} strokeWidth={2} />,
      chipBg: tint(SIGNAL_BLUE, 0.12),
      onPress: shareViaSignal,
    },
    {
      key: 'copy',
      label: copied ? 'Copied!' : hasJoinLink ? 'Copy link' : 'Copy message',
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
              <Text className="font-display text-xl text-foreground">Share trip</Text>
              <Text className="font-sans text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                {hasJoinLink
                  ? 'Anyone with the link can ask to join'
                  : `Let friends know you'll be ${city ? `in ${city}` : 'away'}`}
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
          ) : loading || !link ? (
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
