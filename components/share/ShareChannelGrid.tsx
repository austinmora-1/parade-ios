/**
 * ShareChannelGrid — omni-channel share row matching the PWA
 * UnifiedShareSheet grid: round colored tiles for Messages, WhatsApp,
 * Telegram, and Email, plus Copy and a native "More" sheet, followed by a
 * read-only link field.
 *
 * Each channel composes the same `${message} ${link}` body the PWA uses and
 * hands off via a deep link (with web fallbacks where the native app may be
 * absent). Copy uses the clipboard; More opens the OS share sheet for every
 * other destination (AirDrop, Notes, Instagram, etc.).
 */
import { View, Text, Pressable, Share, Alert, Linking } from 'react-native';
import { useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  MessageSquare,
  Send as SendIcon,
  Mail,
  Copy,
  Check,
  MoreHorizontal,
} from 'lucide-react-native';

// Tile colors converted from the PWA's HSL channel palette.
const SMS_GREEN = '#22C35D';      // hsl(142 70% 45%)
const WHATSAPP_GREEN = '#1FAD53'; // hsl(142 70% 40%)
const TELEGRAM_BLUE = '#0DA6F2';  // hsl(200 90% 50%)
const EMAIL_RED = '#E23636';      // hsl(0 75% 55%)

function WhatsAppGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </Svg>
  );
}

interface ShareChannelGridProps {
  /** The share URL. Null while still being generated. */
  link: string | null;
  /** Leading message text; the link is appended for body-bearing channels. */
  message: string;
  /** Subject line for the email channel. */
  emailSubject: string;
  /** Title passed to the native share sheet. */
  title: string;
}

export function ShareChannelGrid({ link, message, emailSubject, title }: ShareChannelGridProps) {
  const [copied, setCopied] = useState(false);

  const openUrl = async (url: string, fallback?: string) => {
    if (!link) return;
    Haptics.selectionAsync();
    try {
      await Linking.openURL(url);
    } catch {
      if (fallback) {
        try {
          await Linking.openURL(fallback);
          return;
        } catch {
          /* fall through */
        }
      }
      Alert.alert('App not available', 'That app does not appear to be installed.');
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMore = async () => {
    if (!link) return;
    Haptics.selectionAsync();
    try {
      await Share.share({ title, message: `${message} ${link}`, url: link });
    } catch {
      /* cancelled */
    }
  };

  const channels: {
    key: string;
    label: string;
    tile: string;
    icon: React.ReactNode;
    onPress: () => void;
  }[] = [
    {
      key: 'sms',
      label: 'Messages',
      tile: SMS_GREEN,
      icon: <MessageSquare size={20} color="#FFFFFF" strokeWidth={2} />,
      onPress: () => openUrl(`sms:&body=${encodeURIComponent(`${message} ${link}`)}`),
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      tile: WHATSAPP_GREEN,
      icon: <WhatsAppGlyph size={20} />,
      onPress: () =>
        openUrl(
          `whatsapp://send?text=${encodeURIComponent(`${message} ${link}`)}`,
          `https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`,
        ),
    },
    {
      key: 'telegram',
      label: 'Telegram',
      tile: TELEGRAM_BLUE,
      icon: <SendIcon size={20} color="#FFFFFF" strokeWidth={2} />,
      onPress: () =>
        openUrl(
          `tg://msg_url?url=${encodeURIComponent(link!)}&text=${encodeURIComponent(message)}`,
          `https://t.me/share/url?url=${encodeURIComponent(link!)}&text=${encodeURIComponent(message)}`,
        ),
    },
    {
      key: 'email',
      label: 'Email',
      tile: EMAIL_RED,
      icon: <Mail size={20} color="#FFFFFF" strokeWidth={2} />,
      onPress: () =>
        openUrl(
          `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(`${message}\n\n${link}`)}`,
        ),
    },
  ];

  const Tile = ({
    label,
    bg,
    icon,
    onPress,
  }: {
    label: string;
    bg: string;
    icon: React.ReactNode;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={!link}
      className={`items-center gap-1.5 active:opacity-70 ${link ? '' : 'opacity-50'}`}
      style={{ width: '25%' }}
    >
      <View
        className="w-12 h-12 rounded-full items-center justify-center shadow-sm"
        style={{ backgroundColor: bg }}
      >
        {icon}
      </View>
      <Text className="font-sans text-[11px] text-muted-foreground leading-tight">{label}</Text>
    </Pressable>
  );

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap" style={{ rowGap: 14 }}>
        {channels.map((c) => (
          <Tile key={c.key} label={c.label} bg={c.tile} icon={c.icon} onPress={c.onPress} />
        ))}
        <Tile
          label={copied ? 'Copied' : 'Copy'}
          bg="#E7E2D6"
          icon={
            copied ? (
              <Check size={20} color="#23744D" strokeWidth={2.5} />
            ) : (
              <Copy size={20} color="#3A352C" strokeWidth={2} />
            )
          }
          onPress={handleCopy}
        />
        <Tile
          label="More"
          bg="#E7E2D6"
          icon={<MoreHorizontal size={20} color="#3A352C" strokeWidth={2} />}
          onPress={handleMore}
        />
      </View>

      {/* Read-only link field */}
      <View className="bg-muted/50 rounded-xl px-3.5 py-2.5 border border-border/30">
        <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
          {link ?? 'Generating link…'}
        </Text>
      </View>
    </View>
  );
}

export default ShareChannelGrid;
