import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Calendar as CalendarIcon,
  Check,
  RefreshCw,
  Apple,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { formatDistanceToNow } from 'date-fns';
import { TINT } from '@/lib/colors';
import { CALENDAR_SYNC_DAYS_AHEAD } from '@/lib/calendarSync';
import { SectionCard, SectionHeader } from '@/components/settings/SettingsPrimitives';
import type { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import type { useNylasCalendar } from '@/hooks/useNylasCalendar';

// ─── Calendar row primitives ─────────────────────────────────────────────────

type ConnState = 'loading' | 'connected' | 'disconnected';

function CalendarProviderRow({
  providerLabel,
  providerHint,
  icon,
  state,
  isBusy,
  onConnect,
  onDisconnect,
  topBorder,
}: {
  providerLabel: string;
  providerHint:  string;
  icon:          React.ReactNode;
  state:         ConnState;
  isBusy?:       boolean;
  onConnect:     () => void | Promise<void>;
  onDisconnect:  () => void;
  topBorder?:    boolean;
}) {
  return (
    <View
      className={`px-4 py-3 flex-row items-center justify-between gap-3 ${
        topBorder ? 'border-t border-border/20' : ''
      }`}
    >
      <View className="flex-row items-center gap-2.5 flex-1">
        <View className="w-9 h-9 rounded-xl items-center justify-center bg-card border border-border/40">
          {icon}
        </View>
        <View className="flex-1">
          <Text className="font-sans text-sm font-medium text-foreground">
            {providerLabel}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
            {providerHint}
          </Text>
        </View>
      </View>

      {state === 'loading' || isBusy ? (
        <View className="px-3 py-1.5">
          <ActivityIndicator size="small" color="#23744D" />
        </View>
      ) : state === 'connected' ? (
        <View className="flex-row items-center gap-1.5">
          <View
            className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: TINT.primarySubtle }}
          >
            <Check size={11} color="#23744D" strokeWidth={2.5} />
            <Text className="font-sans text-[11px] font-semibold text-primary">
              On
            </Text>
          </View>
          <Pressable
            onPress={onDisconnect}
            className="border border-border/40 rounded-xl px-2.5 py-1 active:opacity-70"
            hitSlop={4}
          >
            <Text className="font-sans text-[11px] font-semibold text-foreground/70">
              Disconnect
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onConnect}
          className="bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
          hitSlop={4}
        >
          <Text className="font-sans text-xs font-semibold text-white">
            Connect
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function CalendarSyncRow({
  label,
  lastSyncedAt,
  lastResult,
  isSyncing,
  onSync,
}: {
  label:        string;
  lastSyncedAt: string | null;
  lastResult:   { eventsProcessed?: number; datesUpdated?: number } | null;
  isSyncing:    boolean;
  onSync:       () => void | Promise<void>;
}) {
  const subtitle = lastSyncedAt
    ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}` +
      (lastResult?.eventsProcessed
        ? ` · ${lastResult.eventsProcessed} events → ${lastResult.datesUpdated ?? 0} days`
        : '')
    : `Pull busy times from the next ${CALENDAR_SYNC_DAYS_AHEAD} days.`;
  return (
    <Pressable
      onPress={onSync}
      disabled={isSyncing}
      className="px-4 py-3 flex-row items-center justify-between gap-3 border-t border-border/20 active:bg-muted/30"
    >
      <View className="flex-1">
        <Text className="font-sans text-sm font-medium text-foreground">
          {label}
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          {subtitle}
        </Text>
      </View>
      {isSyncing ? (
        <ActivityIndicator size="small" color="#23744D" />
      ) : (
        <View className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-1.5">
          <RefreshCw size={12} color="#23744D" strokeWidth={2.2} />
          <Text className="font-sans text-xs font-semibold text-primary">
            Sync
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function GoogleGlyph() {
  // Multi-color "G" using react-native-svg paths
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function AppleGlyph() {
  return <Apple size={16} color="#0B0B0B" strokeWidth={2} />;
}

// ─── Calendar section ────────────────────────────────────────────────────────

export function CalendarSection({
  google,
  nylas,
  calendarState,
  syncing,
  lastSyncAt,
  onConnectDeviceCalendar,
  onSyncDeviceCalendar,
  loadProfileAndAvailability,
}: {
  google:                     ReturnType<typeof useGoogleCalendar>;
  nylas:                      ReturnType<typeof useNylasCalendar>;
  calendarState:              'unknown' | 'granted' | 'denied';
  syncing:                    boolean;
  lastSyncAt:                 Date | null;
  onConnectDeviceCalendar:    () => void | Promise<void>;
  onSyncDeviceCalendar:       () => void | Promise<void>;
  loadProfileAndAvailability: () => Promise<void>;
}) {
  return (
    <SectionCard>
      <SectionHeader
        icon={<CalendarIcon size={14} color="#23744D" strokeWidth={2} />}
        label="Calendar"
      />

      {/* ── Google Calendar row ───────────────────────────────── */}
      <CalendarProviderRow
        providerLabel="Google Calendar"
        providerHint={
          google.isConnected
            ? 'Connected — events sync automatically'
            : 'Sync your Google events'
        }
        icon={<GoogleGlyph />}
        state={
          google.isLoading
            ? 'loading'
            : google.isConnected
              ? 'connected'
              : 'disconnected'
        }
        isBusy={google.isConnecting}
        onConnect={google.connect}
        onDisconnect={() => {
          Alert.alert(
            'Disconnect Google Calendar?',
            'Your synced busy times will stop updating automatically.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Disconnect',
                style: 'destructive',
                onPress: async () => { await google.disconnect(); },
              },
            ],
          );
        }}
      />
      {google.isConnected && (
        <CalendarSyncRow
          label="Sync Google now"
          lastSyncedAt={google.lastSyncedAt}
          lastResult={google.lastSyncResult}
          isSyncing={google.isSyncing}
          onSync={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const result = await google.syncCalendar();
            if (result.synced) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadProfileAndAvailability();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Sync failed', result.message ?? 'Please try again.');
            }
          }}
        />
      )}

      {/* ── Apple Calendar (iCloud via Nylas) row ─────────────── */}
      <CalendarProviderRow
        providerLabel="Apple Calendar"
        providerHint={
          nylas.isConnected
            ? 'Connected via iCloud'
            : 'One-click sync via iCloud'
        }
        icon={<AppleGlyph />}
        state={
          nylas.isLoading
            ? 'loading'
            : nylas.isConnected
              ? 'connected'
              : 'disconnected'
        }
        isBusy={nylas.isConnecting}
        onConnect={() => nylas.connect('icloud')}
        onDisconnect={() => {
          Alert.alert(
            'Disconnect Apple Calendar?',
            'Your synced busy times will stop updating automatically.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Disconnect',
                style: 'destructive',
                onPress: async () => { await nylas.disconnect(); },
              },
            ],
          );
        }}
        topBorder
      />
      {nylas.isConnected && (
        <CalendarSyncRow
          label="Sync Apple now"
          lastSyncedAt={nylas.lastSyncedAt}
          lastResult={nylas.lastSyncResult}
          isSyncing={nylas.isSyncing}
          onSync={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const result = await nylas.syncCalendar();
            if (result.synced) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadProfileAndAvailability();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Sync failed', result.message ?? 'Please try again.');
            }
          }}
        />
      )}

      {/* ── Device Calendar (EventKit) — optional offline fallback ── */}
      <View className="px-4 py-3 border-t border-border/20 gap-1">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Device calendar (optional)
        </Text>
        <View className="flex-row items-center justify-between gap-3 mt-1">
          <View className="flex-1">
            <Text className="font-sans text-sm font-medium text-foreground">
              iPhone Calendar app
            </Text>
            <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
              {calendarState === 'granted'
                ? lastSyncAt
                  ? `Last device sync ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                  : 'Permission granted'
                : 'Pull busy times directly from the iOS Calendar app.'}
            </Text>
          </View>
          {calendarState === 'granted' ? (
            <Pressable
              onPress={onSyncDeviceCalendar}
              disabled={syncing}
              className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-1.5 active:opacity-70"
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#23744D" />
              ) : (
                <>
                  <RefreshCw size={12} color="#23744D" strokeWidth={2.2} />
                  <Text className="font-sans text-xs font-semibold text-primary">
                    Sync
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={onConnectDeviceCalendar}
              className="bg-muted rounded-xl px-3 py-1.5 active:opacity-80"
              hitSlop={4}
            >
              <Text className="font-sans text-xs font-semibold text-foreground/70">
                {calendarState === 'denied' ? 'Open Settings' : 'Allow'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SectionCard>
  );
}
