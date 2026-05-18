/**
 * Settings page — accessed via gear icon on Profile tab.
 *
 * Phase 1 (read-only) stub: just sign-out + footer links.
 * Phase 2 will flesh out notifications/privacy/calendar accordions to match PWA.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ChevronLeft,
  LogOut,
  Bell,
  Sparkles,
  Calendar,
  Send,
} from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  children,
  destructive = false,
}: {
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <View
      className={`mx-5 bg-white rounded-xl overflow-hidden shadow-sm ${
        destructive ? 'border border-destructive/20' : 'border border-border/30'
      }`}
    >
      {children}
    </View>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border/30">
      {icon}
      <Text className="font-display text-sm text-foreground">{label}</Text>
    </View>
  );
}

function PlaceholderRow({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="px-4 py-3 border-b border-border/20">
      <Text className="font-sans text-sm font-medium text-foreground">{title}</Text>
      {subtitle && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
          {subtitle}
        </Text>
      )}
      <Text
        className="font-sans text-[10px] text-muted-foreground/60 mt-1.5 italic"
      >
        Coming soon
      </Text>
    </View>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { signOut, user } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View className="flex-row items-center px-3 pt-2 pb-3 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-base text-foreground">Settings</Text>
          <Text className="font-sans text-[11px] text-muted-foreground">
            Manage your account and preferences
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10 gap-3"
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Notifications stub ──────────────────────────────────────── */}
        <SectionCard>
          <SectionHeader
            icon={<Bell size={14} color="#23744D" strokeWidth={2} />}
            label="Notifications"
          />
          <PlaceholderRow
            title="Plan Reminders"
            subtitle="Get notified before your plans"
          />
          <PlaceholderRow
            title="Friend Requests"
            subtitle="When someone connects with you"
          />
          <PlaceholderRow
            title="Plan Invitations"
            subtitle="When you're invited to a plan"
          />
        </SectionCard>

        {/* ── Privacy stub ────────────────────────────────────────────── */}
        <SectionCard>
          <SectionHeader
            icon={<Sparkles size={14} color="#23744D" strokeWidth={2} />}
            label="Sharing & Privacy"
          />
          <PlaceholderRow
            title="Show Availability"
            subtitle="Friends can see your free slots"
          />
          <PlaceholderRow
            title="Show Vibe"
            subtitle="Friends can see your current vibe"
          />
        </SectionCard>

        {/* ── Calendar stub ───────────────────────────────────────────── */}
        <SectionCard>
          <SectionHeader
            icon={<Calendar size={14} color="#23744D" strokeWidth={2} />}
            label="Calendar"
          />
          <PlaceholderRow
            title="Connect Calendar"
            subtitle="Import busy times from your iPhone calendar"
          />
        </SectionCard>

        {/* ── Account (sign out) ─────────────────────────────────────── */}
        <SectionCard destructive>
          <SectionHeader
            icon={<LogOut size={14} color="#D46549" strokeWidth={2} />}
            label="Account"
          />
          <View className="px-4 py-3 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-sans text-sm font-medium text-foreground">
                Sign Out
              </Text>
              <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                Log out of your Parade account
              </Text>
            </View>
            <Pressable
              onPress={handleSignOut}
              className="bg-destructive rounded-xl px-3 py-2 active:opacity-80"
              hitSlop={4}
            >
              <Text className="font-sans text-xs font-semibold text-white">
                Sign Out
              </Text>
            </Pressable>
          </View>
        </SectionCard>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View className="items-center gap-2 pt-3">
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => Linking.openURL('https://helloparade.app/privacy')}
            >
              <Text className="font-sans text-xs text-muted-foreground">
                Privacy Policy
              </Text>
            </Pressable>
            <Text className="font-sans text-xs text-muted-foreground/40">·</Text>
            <Pressable
              onPress={() => Linking.openURL('https://helloparade.app/terms')}
            >
              <Text className="font-sans text-xs text-muted-foreground">
                Terms of Service
              </Text>
            </Pressable>
          </View>
          {user?.email && (
            <Text className="font-sans text-[11px] text-muted-foreground/60 mt-1">
              Signed in as {user.email}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
