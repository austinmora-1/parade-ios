/**
 * BugReportButton — persistent floating button (bug icon) that opens a sheet
 * for reporting a bug or sending feedback. Submissions go to the
 * `report-issue` edge function, which files a labelled Linear issue (bug →
 * `bug`, feedback → `feedback`) in the UXPE team.
 *
 * Mounted once in the authenticated app shell so it floats over every screen,
 * sitting just above the floating tab bar.
 */
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Bug, X, ImagePlus, Check, Send } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useFloatingTabBarHeight } from '@/components/navigation/FloatingTabBar';
import { EVERGREEN, PARADE_GREEN, TINT } from '@/lib/colors';
import {
  collectContext,
  submitReport,
  uploadScreenshot,
  type ReportType,
  type SubmitReportResult,
} from '@/lib/reportIssue';

const COPY: Record<ReportType, { title: string; placeholder: string; cta: string }> = {
  bug: {
    title: 'Report a bug',
    placeholder: 'What went wrong? Steps to reproduce help a lot.',
    cta: 'Send bug report',
  },
  feedback: {
    title: 'Send feedback',
    placeholder: "What's on your mind? Ideas, requests, anything.",
    cta: 'Send feedback',
  },
};

export function BugReportButton({ route }: { route?: string }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useFloatingTabBarHeight();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType>('bug');
  const [message, setMessage] = useState('');
  const [shotUri, setShotUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitReportResult | null>(null);

  const reset = useCallback(() => {
    setType('bug');
    setMessage('');
    setShotUri(null);
    setSubmitting(false);
    setResult(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Defer reset so it doesn't flash empty during the dismiss animation.
    setTimeout(reset, 250);
  }, [reset]);

  const pickScreenshot = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos access needed', 'Allow photo access to attach a screenshot.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) setShotUri(res.assets[0].uri);
  }, []);

  const onSubmit = useCallback(async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let screenshotUrl: string | null = null;
      if (shotUri && user?.id) {
        screenshotUrl = await uploadScreenshot(shotUri, user.id);
      }
      const res = await submitReport({
        type,
        message: message.trim(),
        email: user?.email ?? null,
        context: collectContext(route),
        screenshotUrl,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(res);
      setTimeout(close, 1600);
    } catch (err: any) {
      console.error('Report submit failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not send', err?.message ?? 'Please try again.');
      setSubmitting(false);
    }
  }, [message, submitting, shotUri, user?.id, user?.email, type, route, close]);

  const copy = COPY[type];

  return (
    <>
      {/* Floating launcher — sits just above the tab bar, right edge */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Report a bug or send feedback"
        hitSlop={8}
        style={{
          position: 'absolute',
          right: 16,
          bottom: tabBarHeight + 4,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: EVERGREEN,
          opacity: 0.92,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Bug size={20} color="#FFFFFF" strokeWidth={2} />
      </Pressable>

      {/* Inline overlay — NOT a RN <Modal>, which renders outside the
          navigation tree and crashes any nav-context access on re-render. */}
      {open && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={close}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Stop backdrop taps from closing when interacting with the card */}
            <Pressable
              onPress={() => {}}
              className="bg-card rounded-t-3xl px-5 pt-4"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              {result ? (
                <View className="items-center py-8 gap-3">
                  <View
                    className="w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: PARADE_GREEN }}
                  >
                    <Check size={24} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                  <Text className="font-display text-lg text-foreground">Sent — thank you!</Text>
                  <Text className="font-sans text-xs text-muted-foreground">
                    {result.identifier
                      ? `Filed as ${result.identifier}`
                      : 'The team will take a look.'}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Header */}
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="font-display text-lg text-foreground">{copy.title}</Text>
                    <Pressable onPress={close} hitSlop={8} className="w-8 h-8 items-center justify-center rounded-full active:opacity-70">
                      <X size={20} color="#929298" strokeWidth={2} />
                    </Pressable>
                  </View>

                  {/* Bug / Feedback toggle */}
                  <View className="flex-row bg-muted rounded-xl p-1 mb-3">
                    {(['bug', 'feedback'] as ReportType[]).map((t) => {
                      const active = type === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setType(t);
                          }}
                          className="flex-1 rounded-lg py-2 items-center"
                          style={active ? { backgroundColor: '#FFFFFF' } : undefined}
                        >
                          <Text
                            className="font-sans text-sm"
                            style={{
                              color: active ? '#1E342A' : '#929298',
                              fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular',
                            }}
                          >
                            {t === 'bug' ? 'Bug' : 'Feedback'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Message */}
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder={copy.placeholder}
                    placeholderTextColor="#929298"
                    multiline
                    autoFocus
                    className="font-sans text-base text-foreground bg-background rounded-2xl border border-border px-4 py-3"
                    style={{ minHeight: 110, textAlignVertical: 'top' }}
                  />

                  {/* Screenshot attach */}
                  <View className="mt-3">
                    {shotUri ? (
                      <View className="flex-row items-center gap-3">
                        <Image
                          source={{ uri: shotUri }}
                          style={{ width: 48, height: 48, borderRadius: 8 }}
                        />
                        <Text className="font-sans text-xs text-muted-foreground flex-1">
                          Screenshot attached
                        </Text>
                        <Pressable onPress={() => setShotUri(null)} hitSlop={8} className="active:opacity-70">
                          <Text className="font-sans text-xs font-semibold text-secondary">Remove</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={pickScreenshot}
                        className="flex-row items-center gap-2 self-start rounded-xl px-3 py-2 active:opacity-70"
                        style={{ backgroundColor: TINT.primarySubtle }}
                      >
                        <ImagePlus size={15} color={PARADE_GREEN} strokeWidth={2} />
                        <Text className="font-sans text-xs font-semibold text-primary">Attach screenshot</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Context note */}
                  <Text className="font-sans text-[11px] text-muted-foreground mt-3">
                    We'll include your current screen, app version, and email so the team can follow up.
                  </Text>

                  {/* Submit */}
                  <Pressable
                    onPress={onSubmit}
                    disabled={!message.trim() || submitting}
                    className="flex-row items-center justify-center gap-2 rounded-2xl py-3.5 mt-4 active:opacity-80"
                    style={{
                      backgroundColor: !message.trim() || submitting ? '#EEE2CB' : PARADE_GREEN,
                    }}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Send size={16} color={!message.trim() ? '#929298' : '#FFFFFF'} strokeWidth={2} />
                        <Text
                          className="font-sans text-sm font-semibold"
                          style={{ color: !message.trim() ? '#929298' : '#FFFFFF' }}
                        >
                          {copy.cta}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
        </View>
      )}
    </>
  );
}
