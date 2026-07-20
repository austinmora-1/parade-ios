/**
 * Claim account — modal-presented account-linking flow.
 *
 * Terminology: the CURRENT signed-in account (phone) is the "keep" account.
 * The email entered here belongs to an OLD legacy email account that gets
 * merged into the current one, then deleted.
 *
 * Reached from Edit profile → email field, when the entered address is
 * already attached to another (legacy) Parade account. A ?email= param
 * prefills stage 1.
 *
 * Two stages, verified by a 6-digit code emailed to the legacy address:
 *   1. "enter email"  → request-account-claim  → sends the code
 *   2. "enter code"   → confirm-account-claim   → merges + returns counts
 * On success, a "Welcome back" summary is built from the merged counts and
 * the affected react-query caches are invalidated before dismissing home.
 */
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { Input } from '@/components/primitives/Input';
import { Button } from '@/components/primitives/Button';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePlanData } from '@/lib/dashboardQuery';
import { TINT } from '@/lib/colors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Stage = 'email' | 'code' | 'done';

/** Shape returned by both claim edge functions (always JSON, ok flag + optionals). */
type FnResult = {
  ok: boolean;
  error?: string;
  attempts_left?: number;
  merged?: Record<string, number> | null;
  email_attached?: boolean;
};

/**
 * Invoke a claim edge function and normalize the body.
 *
 * Business errors (invalid_code, expired, …) come back 200 with { ok:false }.
 * A rate-limit is a 429 — supabase-js surfaces that as a FunctionsHttpError
 * whose `.context` is the raw Response, so the JSON body rides there.
 */
async function invokeClaimFn(
  name: 'request-account-claim' | 'confirm-account-claim',
  body: Record<string, unknown>,
): Promise<FnResult> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        return (await ctx.json()) as FnResult;
      } catch {
        /* body wasn't JSON — fall through to generic */
      }
    }
    return { ok: false, error: 'network' };
  }
  return (data ?? { ok: false, error: 'network' }) as FnResult;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function ClaimAccountScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');

  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<Record<string, number>>({});
  const [emailAttached, setEmailAttached] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);

  // ── Stage 1: request a code ──────────────────────────────────────────────
  const handleSendCode = useCallback(async () => {
    if (!emailValid) {
      setError('Enter a valid email address.');
      return;
    }
    setSending(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await invokeClaimFn('request-account-claim', { email: normalizedEmail });
      if (!res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(
          res.error === 'rate_limited'
            ? 'Too many attempts. Please wait an hour and try again.'
            : 'Something went wrong. Please try again.',
        );
        return;
      }
      // Enumeration-safe: the function returns ok:true whether or not a
      // claimable account existed, so we always advance to the code stage.
      setCode('');
      setError(null);
      setStage('code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }, [emailValid, normalizedEmail]);

  // ── Stage 2: confirm the code (triggers the merge server-side) ───────────
  const handleConfirm = useCallback(async () => {
    if (code.trim().length < 6) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await invokeClaimFn('confirm-account-claim', {
        email: normalizedEmail,
        code: code.trim(),
      });

      if (res.ok) {
        setMerged(res.merged ?? {});
        setEmailAttached(res.email_attached === true);
        setStage('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // The merge moves friends / plans / trips / pods onto this account —
        // refetch everything that renders that data. Friends + plans are backed
        // by the ['dashboard'] query (via the planner-store facade), so a plain
        // invalidate of the keys below is NOT enough — force the dashboard
        // refetch too, or the restored friends/plans won't appear.
        void invalidatePlanData();
        [
          'profile',
          'friend-dashboard-data',
          'trips',
          'upcoming-trips',
          'next-trip',
          'pods',
          'open-invites',
          'hang-requests',
        ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      switch (res.error) {
        case 'invalid_code':
          setError(
            typeof res.attempts_left === 'number' && res.attempts_left > 0
              ? `That code isn't right — ${res.attempts_left} ${plural(res.attempts_left, 'try', 'tries')} left.`
              : typeof res.attempts_left === 'number'
                ? 'That was the last try. Send a new code to start over.'
                : "That code isn't right.",
          );
          break;
        case 'expired':
          setError('That code expired. Send a new one to try again.');
          break;
        case 'too_many_attempts':
          setError('Too many incorrect tries. Send a new code to start over.');
          break;
        case 'no_challenge':
          setError("We couldn't find a pending request. Send a new code.");
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  }, [code, normalizedEmail, queryClient]);

  const handleChangeEmail = useCallback(() => {
    Haptics.selectionAsync();
    setStage('email');
    setCode('');
    setError(null);
  }, []);

  const handleFinish = useCallback(() => {
    Haptics.selectionAsync();
    // Dismiss the claim + edit-profile modals, revealing the tabs (home).
    router.dismissAll();
  }, []);

  // ── Success summary from the merged counts ───────────────────────────────
  const friendsCount = merged.friends ?? 0;
  const plansCount = merged.plans ?? 0;
  const otherCounts = Object.entries(merged).filter(
    ([key, value]) => key !== 'friends' && key !== 'plans' && (value ?? 0) > 0,
  );

  const headerTitle = stage === 'done' ? 'All set' : 'Claim your account';

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title={headerTitle}
        onBack={stage === 'done' ? handleFinish : undefined}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-6 gap-5"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Stage 1: enter email ──────────────────────────────────── */}
          {stage === 'email' && (
            <>
              <View className="gap-1.5">
                <Text className="font-display text-lg text-foreground">
                  Restore your old account
                </Text>
                <Text className="font-sans text-sm text-muted-foreground leading-relaxed">
                  This address is already tied to an older Parade account. Verify
                  it and we'll merge everything — friends, plans, and trips — into
                  the account you're signed into now.
                </Text>
              </View>

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
              />

              {error ? (
                <Text className="font-sans text-sm text-destructive">{error}</Text>
              ) : null}

              <Button
                label="Send code"
                size="lg"
                loading={sending}
                disabled={!emailValid}
                onPress={handleSendCode}
                className="w-full"
              />

              <Text className="font-sans text-[11px] text-muted-foreground leading-relaxed">
                We'll email a 6-digit code to {emailValid ? normalizedEmail : 'that address'} to
                confirm it's yours.
              </Text>
            </>
          )}

          {/* ── Stage 2: enter code ───────────────────────────────────── */}
          {stage === 'code' && (
            <>
              <View className="gap-1.5">
                <Text className="font-display text-lg text-foreground">
                  Enter your code
                </Text>
                <Text className="font-sans text-sm text-muted-foreground leading-relaxed">
                  We emailed a 6-digit code to{' '}
                  <Text className="text-foreground font-semibold">{normalizedEmail}</Text>. Enter it
                  below to finish claiming your account.
                </Text>
              </View>

              <Input
                label="Verification code"
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, ''));
                  setError(null);
                }}
              />

              {error ? (
                <Text className="font-sans text-sm text-destructive">{error}</Text>
              ) : null}

              <Button
                label="Claim account"
                size="lg"
                loading={confirming}
                disabled={code.trim().length < 6}
                onPress={handleConfirm}
                className="w-full"
              />

              <View className="flex-row items-center justify-between">
                <Pressable onPress={handleChangeEmail} hitSlop={6}>
                  <Text className="font-sans text-sm text-primary font-medium">
                    ← Change email
                  </Text>
                </Pressable>
                <Pressable onPress={handleSendCode} disabled={sending} hitSlop={6}>
                  <Text className="font-sans text-sm text-primary font-medium">
                    {sending ? 'Sending…' : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {/* ── Stage 3: success ──────────────────────────────────────── */}
          {stage === 'done' && (
            <View className="items-center gap-5 pt-6">
              <View
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: TINT.primaryBorder }}
              >
                <Check size={32} color="#23744D" strokeWidth={2.5} />
              </View>

              <View className="items-center gap-1.5">
                <Text className="font-display text-xl text-foreground text-center">
                  Welcome back
                </Text>
                <Text className="font-sans text-base text-muted-foreground text-center leading-relaxed">
                  Restored {friendsCount} {plural(friendsCount, 'friend', 'friends')} and{' '}
                  {plansCount} {plural(plansCount, 'plan', 'plans')}.
                </Text>
                {emailAttached && (
                  <Text className="font-sans text-sm text-muted-foreground text-center leading-relaxed">
                    Your email is now on this account.
                  </Text>
                )}
              </View>

              {otherCounts.length > 0 && (
                <View className="w-full gap-2 rounded-2xl bg-card border border-border/40 px-4 py-3">
                  {otherCounts.map(([key, value]) => (
                    <View key={key} className="flex-row items-center justify-between">
                      <Text className="font-sans text-sm text-muted-foreground capitalize">
                        {key.replace(/_/g, ' ')}
                      </Text>
                      <Text className="font-sans text-sm font-semibold text-foreground">
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Button
                label="Done"
                size="lg"
                onPress={handleFinish}
                className="w-full"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
